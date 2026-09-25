-- Account lifecycle, user controls, stable chat pagination, and moderation.
-- All client mutations remain authenticated, narrow SECURITY DEFINER RPCs.
alter table public.conversations add column closed_at timestamptz;
-- Carry existing blocks into the new explicit consent state on upgrades.
update public.conversations c set closed_at = now() where exists (
  select 1 from public.blocks b where (b.blocker_id = c.member_a and b.blocked_id = c.member_b)
    or (b.blocker_id = c.member_b and b.blocked_id = c.member_a)
);
update public.letters l set status = 'expired', respond_by = null where l.status = 'accepted' and exists (
  select 1 from public.blocks b where (b.blocker_id = l.sender_id and b.blocked_id = l.recipient_id)
    or (b.blocker_id = l.recipient_id and b.blocked_id = l.sender_id)
);
create or replace function public.can_read_conversation(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations c where c.id = p_conversation and c.closed_at is null
    and auth.uid() in (c.member_a, c.member_b) and private.same_circle(c.member_a, c.member_b))
$$;

create index messages_cursor on public.messages(conversation_id, created_at desc, id desc);
create index reports_rate_limit on public.reports(reporter_id, created_at);

create function public.message_history(p_conversation uuid, p_before_at timestamptz default null, p_before_id uuid default null, p_limit integer default 100)
returns setof public.messages language sql stable security invoker set search_path = '' as $$
  select m.* from public.messages m
  where m.conversation_id = p_conversation
    and (p_before_at is null or (m.created_at, m.id) < (p_before_at, p_before_id))
  order by m.created_at desc, m.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 100))
$$;

create function public.report_explorer(p_user uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_member(); report_id uuid;
begin
  -- Serializes the per-account report limit, including report-and-block calls.
  perform 1 from public.profiles where id in (u, p_user) order by id for update;
  if p_user is null or p_user = u or not (
    private.same_circle(u, p_user) or exists (
      select 1 from public.blocks where blocker_id = u and blocked_id = p_user
    )
  ) then raise exception 'This explorer is unavailable.' using errcode = '42501'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 3 and 1000 then
    raise exception 'Please give a report reason of 3–1,000 characters.';
  end if;
  -- A retried report with the same content on the same day is not duplicated.
  select id into report_id from public.reports where reporter_id = u and reported_id = p_user
    and reason = trim(p_reason) and created_at > now() - interval '24 hours' order by created_at desc limit 1;
  if found then return report_id; end if;
  if (select count(*) from public.reports where reporter_id = u and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Report limit reached. Please try again later.';
  end if;
  insert into public.reports(reporter_id, reported_id, reason) values(u, p_user, trim(p_reason)) returning id into report_id;
  return report_id;
end $$;

create or replace function public.block_explorer(p_user uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_member();
begin
  if p_user is null or u = p_user then raise exception 'Choose another explorer.'; end if;
  perform 1 from public.profiles where id in (u, p_user) order by id for update;
  if not private.same_circle(u, p_user) and not exists(select 1 from public.blocks where blocker_id = u and blocked_id = p_user) then
    raise exception 'This explorer is unavailable.';
  end if;
  if p_reason is not null then perform public.report_explorer(p_user, p_reason); end if;
  insert into public.blocks(blocker_id, blocked_id) values(u, p_user) on conflict do nothing;
  -- Close consent as well: unblocking must never silently reopen an old chat.
  update public.conversations set closed_at = now() where member_a = least(u, p_user) and member_b = greatest(u, p_user);
  update public.letters set status = 'expired', respond_by = null where status in ('traveling','arrived','accepted')
    and ((sender_id = u and recipient_id = p_user) or (sender_id = p_user and recipient_id = u));
end $$;

create or replace function public.decide_letter(p_letter uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_member(); l public.letters; room uuid;
begin
  select * into l from public.letters where id = p_letter for update;
  if not found or l.recipient_id <> u or not private.same_circle(l.sender_id, u) then raise exception 'This letter is unavailable.' using errcode = '42501'; end if;
  if l.status = 'accepted' and p_accept then
    select id into room from public.conversations where member_a = least(l.sender_id, u) and member_b = greatest(l.sender_id, u); return room;
  end if;
  if p_accept is null or l.status <> 'arrived' or l.arrives_at > now() or l.expires_at <= now() or l.respond_by <= now() then raise exception 'This letter is not available to accept or pass.'; end if;
  perform 1 from public.profiles where id in (u, l.sender_id) order by id for update;
  if not private.same_circle(l.sender_id, u) then raise exception 'This explorer is no longer available.'; end if;
  if not p_accept then perform private.reroute(l.id); return null; end if;
  insert into public.conversations(member_a, member_b) values(least(l.sender_id, u), greatest(l.sender_id, u))
    on conflict (member_a, member_b) do update set closed_at = null returning id into room;
  insert into public.messages(conversation_id, sender_id, body, letter_id, client_id) values(room, l.sender_id, l.body, l.id, gen_random_uuid())
    on conflict (letter_id) do nothing;
  update public.letters set status = 'accepted' where id = l.id;
  insert into public.notifications(user_id, kind, letter_id) values(l.sender_id, 'letter_accepted', l.id) on conflict do nothing;
  return room;
end $$;

create function public.unblock_explorer(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_member();
begin
  perform 1 from public.profiles where id in (u, p_user) order by id for update;
  delete from public.blocks where blocker_id = u and blocked_id = p_user;
end $$;

-- Works before profile creation and for suspended accounts, too. There is no
-- target ID argument: a caller can only delete their own Auth user and data.
create function public.delete_account(p_confirmation text) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if p_confirmation is distinct from 'DELETE' then raise exception 'Type DELETE to confirm permanent account deletion.'; end if;
  delete from auth.users where id = u;
end $$;

drop function public.mark_notifications_read();
create function public.mark_notifications_read(p_through_id bigint default null) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null
    and (p_through_id is null or id <= p_through_id)
$$;

-- Trusted operator only, via SQL Editor or a server holding a service key.
-- Never grant this function to the mobile client.
create function public.review_report(p_report uuid, p_status text, p_suspend boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if p_status is null or p_status not in ('reviewed','resolved') then raise exception 'Choose reviewed or resolved.'; end if;
  select reported_id into target from public.reports where id = p_report for update;
  if not found then raise exception 'Report not found.'; end if;
  update public.reports set status = p_status where id = p_report;
  if p_suspend then
    update public.profiles set active = false where id = target;
    update public.letters set status = 'expired', respond_by = null
      where status in ('traveling','arrived') and target in (sender_id, recipient_id);
  end if;
end $$;

revoke all on function public.message_history(uuid,timestamptz,uuid,integer), public.report_explorer(uuid,text),
  public.unblock_explorer(uuid), public.delete_account(text), public.mark_notifications_read(bigint),
  public.review_report(uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.message_history(uuid,timestamptz,uuid,integer), public.report_explorer(uuid,text),
  public.unblock_explorer(uuid), public.delete_account(text), public.mark_notifications_read(bigint) to authenticated;
grant execute on function public.review_report(uuid,text,boolean) to service_role;

create or replace function public.backend_status() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('app', 'pigeon-post', 'schema_version', 2, 'server_time', now())
$$;
