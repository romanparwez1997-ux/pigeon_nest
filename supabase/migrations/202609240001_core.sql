-- Pigeon Post: tables, access rules, and transactional application API.
-- Never expose the private schema through the Supabase Data API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 30),
  country text not null check (char_length(trim(country)) between 2 and 60),
  interests text[] not null check (cardinality(interests) between 3 and 12 and interests <@ array['Travel','Music','Books','Art','Gaming','Photography','Food','Nature','Films','Languages','Space','Coffee']::text[]),
  languages text[] not null default array['en']::text[] check (cardinality(languages) between 1 and 8),
  bio text not null default '' check (char_length(bio) <= 300),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table private.birthdays (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  birthday date not null
);
create table public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  points integer not null default 120 check (points >= 0)
);
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id), check (blocker_id <> blocked_id)
);
create index blocks_reverse on public.blocks(blocked_id, blocker_id);
create table public.letters (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 20 and 800),
  courier text not null check (courier in ('pigeon','postman')),
  target_kind text not null check (target_kind in ('anywhere','country','person')),
  target_country text,
  target_person_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'traveling' check (status in ('traveling','arrived','accepted','expired')),
  attempt_count integer not null default 1 check (attempt_count between 1 and 3),
  sent_at timestamptz not null default now(),
  arrives_at timestamptz not null,
  respond_by timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  client_id uuid not null,
  unique (sender_id, client_id), check (sender_id <> recipient_id),
  check ((target_kind = 'anywhere' and target_country is null and target_person_id is null)
    or (target_kind = 'country' and target_country is not null and target_person_id is null)
    or (target_kind = 'person' and target_person_id is not null and target_country is null))
);
create index letters_inbox on public.letters(recipient_id, status, arrives_at);
create index letters_sender on public.letters(sender_id, sent_at desc);
create index letters_due on public.letters(status, arrives_at, respond_by) where status in ('traveling','arrived');
create table private.delivery_attempts (
  letter_id uuid not null references public.letters(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  primary key (letter_id, recipient_id)
);
create table public.points_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('welcome','postage')),
  letter_id uuid unique references public.letters(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index one_welcome_credit on public.points_ledger(user_id) where reason = 'welcome';
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.profiles(id) on delete cascade,
  member_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(member_a, member_b), check (member_a < member_b)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  letter_id uuid unique references public.letters(id) on delete set null,
  client_id uuid not null,
  created_at timestamptz not null default now(),
  unique(sender_id, client_id)
);
create index messages_history on public.messages(conversation_id, created_at);
create index messages_rate_limit on public.messages(sender_id, created_at);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending','reviewed','resolved')),
  created_at timestamptz not null default now(), check (reporter_id <> reported_id)
);
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('letter_arrived','letter_accepted')),
  letter_id uuid not null references public.letters(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, kind, letter_id)
);

-- All birthday and block checks happen at the time of the operation, including
-- when someone turns 18. Birthdays never appear in discovery or profile reads.
create function private.same_circle(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select a <> b and exists (
    select 1 from private.birthdays da join private.birthdays db on db.user_id = b
    join public.profiles pa on pa.id = da.user_id join public.profiles pb on pb.id = db.user_id
    where da.user_id = a and pa.active and pb.active
      and da.birthday <= (now() at time zone 'UTC')::date - interval '16 years'
      and db.birthday <= (now() at time zone 'UTC')::date - interval '16 years'
      and (da.birthday > (now() at time zone 'UTC')::date - interval '18 years') = (db.birthday > (now() at time zone 'UTC')::date - interval '18 years')
      and not exists (select 1 from public.blocks x where (x.blocker_id = a and x.blocked_id = b) or (x.blocker_id = b and x.blocked_id = a))
  )
$$;
create function public.can_interact(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.same_circle(auth.uid(), p_other)
$$;
create function public.can_read_conversation(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations c where c.id = p_conversation
    and auth.uid() in (c.member_a, c.member_b) and private.same_circle(c.member_a, c.member_b))
$$;
create function private.require_member() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles p join private.birthdays b on b.user_id = p.id where p.id = u and p.active
    and b.birthday <= (now() at time zone 'UTC')::date - interval '16 years') then
    raise exception 'Create an eligible explorer profile first.' using errcode = '42501';
  end if;
  return u;
end $$;

alter table public.profiles enable row level security;
alter table private.birthdays enable row level security;
alter table public.wallets enable row level security;
alter table public.blocks enable row level security;
alter table public.letters enable row level security;
alter table private.delivery_attempts enable row level security;
alter table public.points_ledger enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;

create policy profile_discovery on public.profiles for select to authenticated using (id = auth.uid() or public.can_interact(id));
create policy wallet_owner on public.wallets for select to authenticated using (user_id = auth.uid());
create policy block_owner on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy ledger_owner on public.points_ledger for select to authenticated using (user_id = auth.uid());
create policy letter_participant on public.letters for select to authenticated using (
  sender_id = auth.uid() or (recipient_id = auth.uid() and status in ('arrived','accepted')
    and arrives_at <= now() and (status = 'accepted' or (expires_at > now() and respond_by > now())) and public.can_interact(sender_id))
);
create policy conversation_member on public.conversations for select to authenticated using (
  auth.uid() in (member_a, member_b) and public.can_read_conversation(id)
);
create policy message_member on public.messages for select to authenticated using (public.can_read_conversation(conversation_id));
create policy report_owner on public.reports for select to authenticated using (reporter_id = auth.uid());
create policy notification_owner on public.notifications for select to authenticated using (user_id = auth.uid());

create function public.create_profile(p_name text, p_birthday date, p_country text, p_interests text[], p_languages text[] default array['en']::text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if p_birthday is null or p_birthday > (now() at time zone 'UTC')::date - interval '16 years'
    or p_birthday < (now() at time zone 'UTC')::date - interval '120 years' then raise exception 'You must be at least 16 to join.'; end if;
  if exists (select 1 from public.profiles where id = u) then raise exception 'Your profile already exists. Your birthday cannot be changed here.'; end if;
  insert into public.profiles(id, name, country, interests, languages)
    values(u, trim(p_name), trim(p_country), array(select distinct unnest(p_interests)), p_languages);
  insert into private.birthdays values (u, p_birthday);
  insert into public.wallets(user_id) values(u);
  insert into public.points_ledger(user_id, delta, reason) values(u, 120, 'welcome');
  return u;
end $$;

create function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('profile', to_jsonb(p), 'birthday', b.birthday, 'points', w.points)
  from public.profiles p join private.birthdays b on b.user_id = p.id join public.wallets w on w.user_id = p.id
  where p.id = auth.uid()
$$;

create function public.update_profile(p_name text, p_country text, p_interests text[], p_languages text[], p_bio text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_member();
begin
  update public.profiles set name = trim(p_name), country = trim(p_country), interests = array(select distinct unnest(p_interests)), languages = p_languages, bio = trim(p_bio) where id = u;
end $$;

create function public.discover(p_country text default null, p_search text default '', p_limit integer default 50)
returns setof public.profiles language sql stable security definer set search_path = '' as $$
  select p.* from public.profiles p join public.profiles me on me.id = auth.uid()
  where private.same_circle(me.id, p.id) and (p_country is null or p.country = p_country)
    and (coalesce(p_search, '') = '' or p.name ilike '%' || replace(replace(p_search, '%', '\%'), '_', '\_') || '%')
  order by (select count(*) from unnest(p.interests) i where i = any(me.interests)) desc, p.id
  limit greatest(1, least(coalesce(p_limit, 50), 100))
$$;

create function private.choose_recipient(p_sender uuid, p_kind text, p_country text, p_person uuid, p_letter uuid default null) returns uuid
language sql volatile security definer set search_path = '' as $$
  select p.id from public.profiles p join public.profiles me on me.id = p_sender
  where private.same_circle(p_sender, p.id)
    and (p_kind <> 'country' or p.country = p_country) and (p_kind <> 'person' or p.id = p_person)
    and not exists (select 1 from private.delivery_attempts a where a.letter_id = p_letter and a.recipient_id = p.id)
    and not exists (select 1 from public.letters l where l.sender_id = p_sender and l.recipient_id = p.id and l.status in ('traveling','arrived') and l.expires_at > now() and (p_letter is null or l.id <> p_letter))
    and (select count(*) from public.letters l where l.recipient_id = p.id and l.status in ('traveling','arrived') and l.expires_at > now()) < 30
  order by (select count(*) from unnest(p.interests) i where i = any(me.interests)) desc, random()
  limit 1
$$;

create function public.send_letter(p_body text, p_courier text, p_client_id uuid, p_target_kind text default 'anywhere', p_target_country text default null, p_target_person uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_member(); recipient uuid; letter public.letters; balance integer; delay interval;
begin
  if p_client_id is null then raise exception 'A request ID is required.'; end if;
  -- A wallet lock serializes sends from one account: double taps cannot overspend.
  select points into balance from public.wallets where user_id = u for update;
  select * into letter from public.letters where sender_id = u and client_id = p_client_id;
  if found then
    if letter.body is distinct from trim(p_body) or letter.courier is distinct from p_courier or letter.target_kind is distinct from p_target_kind
      or letter.target_country is distinct from p_target_country or letter.target_person_id is distinct from p_target_person then raise exception 'Request ID was already used for another letter.'; end if;
    return letter.id;
  end if;
  if p_body is null or char_length(trim(p_body)) not between 20 and 800 then raise exception 'Letters must contain 20–800 characters.'; end if;
  if p_courier is null or p_courier not in ('pigeon','postman') then raise exception 'Choose a valid courier.'; end if;
  if p_target_kind is null or p_target_kind not in ('anywhere','country','person')
    or (p_target_kind = 'country' and (p_target_country is null or p_target_person is not null))
    or (p_target_kind = 'person' and (p_target_person is null or p_target_country is not null))
    or (p_target_kind = 'anywhere' and (p_target_country is not null or p_target_person is not null)) then raise exception 'Choose a valid destination.'; end if;
  if balance < 10 then raise exception 'You need 10 postage points.'; end if;
  if (select count(*) from public.letters where sender_id = u and status in ('traveling','arrived') and expires_at > now()) >= 5 then raise exception 'Five letters are already on a journey.'; end if;
  if (select count(*) from public.letters where sender_id = u and sent_at > now() - interval '24 hours') >= 10 then raise exception 'You have reached the daily limit of 10 letters.'; end if;
  recipient := private.choose_recipient(u, p_target_kind, p_target_country, p_target_person);
  if recipient is null then raise exception 'No available explorer in this destination and your friendship circle.'; end if;
  -- Lock the receiving profile before rechecking inbox capacity and interaction.
  perform 1 from public.profiles where id in (u, recipient) order by id for update;
  if not private.same_circle(u, recipient) or (p_target_kind = 'country' and not exists(select 1 from public.profiles where id = recipient and country = p_target_country)) then raise exception 'This explorer is no longer available.'; end if;
  if (select count(*) from public.letters where recipient_id = recipient and status in ('traveling','arrived') and expires_at > now()) >= 30 then raise exception 'This inbox is full. Please try again later.'; end if;
  delay := case p_courier when 'pigeon' then interval '15 minutes' else interval '1 hour' end;
  insert into public.letters(sender_id, recipient_id, body, courier, target_kind, target_country, target_person_id, arrives_at, client_id)
    values(u, recipient, trim(p_body), p_courier, p_target_kind, p_target_country, p_target_person, now() + delay, p_client_id) returning * into letter;
  insert into private.delivery_attempts(letter_id, recipient_id) values(letter.id, recipient);
  update public.wallets set points = points - 10 where user_id = u;
  insert into public.points_ledger(user_id, delta, reason, letter_id) values(u, -10, 'postage', letter.id);
  return letter.id;
end $$;

create function private.reroute(p_letter uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.letters; recipient uuid;
begin
  select * into l from public.letters where id = p_letter for update;
  if not found or l.status not in ('traveling','arrived') then return; end if;
  if l.expires_at <= now() or l.target_kind = 'person' or l.attempt_count >= 3 then
    update public.letters set status = 'expired', respond_by = null where id = l.id; return;
  end if;
  recipient := private.choose_recipient(l.sender_id, l.target_kind, l.target_country, l.target_person_id, l.id);
  if recipient is null then update public.letters set status = 'expired', respond_by = null where id = l.id; return; end if;
  perform 1 from public.profiles where id in (l.sender_id, recipient) order by id for update;
  if not private.same_circle(l.sender_id, recipient) or (l.target_kind = 'country' and not exists(select 1 from public.profiles where id = recipient and country = l.target_country))
    or (select count(*) from public.letters where recipient_id = recipient and status in ('traveling','arrived') and expires_at > now()) >= 30 then
    update public.letters set status = 'expired', respond_by = null where id = l.id; return;
  end if;
  insert into private.delivery_attempts(letter_id, recipient_id) values(l.id, recipient);
  update public.letters set recipient_id = recipient, status = 'traveling', attempt_count = attempt_count + 1, respond_by = null,
    arrives_at = now() + case courier when 'pigeon' then interval '15 minutes' else interval '1 hour' end where id = l.id;
end $$;

create function public.decide_letter(p_letter uuid, p_accept boolean) returns uuid
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
    on conflict (member_a, member_b) do update set member_a = excluded.member_a returning id into room;
  insert into public.messages(conversation_id, sender_id, body, letter_id, client_id) values(room, l.sender_id, l.body, l.id, gen_random_uuid())
    on conflict (letter_id) do nothing;
  update public.letters set status = 'accepted' where id = l.id;
  insert into public.notifications(user_id, kind, letter_id) values(l.sender_id, 'letter_accepted', l.id) on conflict do nothing;
  return room;
end $$;

create function public.send_message(p_conversation uuid, p_body text, p_client_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_member(); c public.conversations; m public.messages;
begin
  perform 1 from public.wallets where user_id = u for update;
  if not public.can_read_conversation(p_conversation) then raise exception 'This conversation is unavailable.' using errcode = '42501'; end if;
  if p_client_id is null then raise exception 'A request ID is required.'; end if;
  select * into m from public.messages where sender_id = u and client_id = p_client_id;
  if found then
    if m.conversation_id is distinct from p_conversation or m.body is distinct from trim(p_body) then raise exception 'Request ID was already used for another message.'; end if;
    return m.id;
  end if;
  if p_body is null or char_length(trim(p_body)) not between 1 and 2000 then raise exception 'Messages must contain 1–2,000 characters.'; end if;
  if (select count(*) from public.messages where sender_id = u and created_at > now() - interval '1 minute') >= 30 then raise exception 'Please slow down and try again in a minute.'; end if;
  select * into c from public.conversations where id = p_conversation;
  perform 1 from public.profiles where id in (c.member_a, c.member_b) order by id for update;
  if not private.same_circle(c.member_a, c.member_b) then raise exception 'This conversation is no longer available.'; end if;
  insert into public.messages(conversation_id, sender_id, body, client_id) values(p_conversation, u, trim(p_body), p_client_id) returning * into m;
  return m.id;
end $$;

create function public.block_explorer(p_user uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_member();
begin
  if u = p_user or not exists(select 1 from public.profiles where id = p_user) then raise exception 'Choose another explorer.'; end if;
  if not private.same_circle(u, p_user) and not exists(select 1 from public.blocks where blocker_id = u and blocked_id = p_user) then raise exception 'This explorer is unavailable.'; end if;
  perform 1 from public.profiles where id in (u, p_user) order by id for update;
  insert into public.blocks(blocker_id, blocked_id) values(u, p_user) on conflict do nothing;
  if p_reason is not null then
    if (select count(*) from public.reports where reporter_id = u and created_at > now() - interval '24 hours') >= 20 then raise exception 'Report limit reached. Please try again later.'; end if;
    insert into public.reports(reporter_id, reported_id, reason) values(u, p_user, trim(p_reason));
  end if;
  update public.letters set status = 'expired', respond_by = null where status in ('traveling','arrived')
    and ((sender_id = u and recipient_id = p_user) or (sender_id = p_user and recipient_id = u));
end $$;

create function public.mark_notifications_read() returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;

-- Scheduled worker. No phone timer and no client may call this function.
create function public.process_deliveries(p_batch integer default 100) returns integer
language plpgsql security definer set search_path = '' as $$
declare l public.letters; processed integer := 0;
begin
  for l in select * from public.letters
    where status in ('traveling','arrived') and (expires_at <= now() or (status = 'traveling' and arrives_at <= now()) or (status = 'arrived' and respond_by <= now()))
    order by arrives_at for update skip locked limit greatest(1, least(coalesce(p_batch,100),500))
  loop
    processed := processed + 1;
    if l.expires_at <= now() then update public.letters set status = 'expired', respond_by = null where id = l.id;
    elsif not private.same_circle(l.sender_id, l.recipient_id) or (l.target_kind = 'country' and not exists(select 1 from public.profiles where id = l.recipient_id and country = l.target_country)) then perform private.reroute(l.id);
    elsif l.status = 'traveling' then
      update public.letters set status = 'arrived', respond_by = least(now() + interval '24 hours', expires_at) where id = l.id;
      insert into public.notifications(user_id, kind, letter_id) values(l.recipient_id, 'letter_arrived', l.id) on conflict do nothing;
    else perform private.reroute(l.id);
    end if;
  end loop;
  return processed;
end $$;

-- Default EXECUTE grants are too broad for a mobile backend. Explicit allowlist.
revoke all on public.profiles, public.wallets, public.blocks, public.letters, public.points_ledger, public.conversations, public.messages, public.reports, public.notifications from public, anon, authenticated;
revoke all on private.birthdays, private.delivery_attempts from public, anon, authenticated;
revoke all on sequence public.points_ledger_id_seq, public.notifications_id_seq from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.can_interact(uuid), public.can_read_conversation(uuid),
  public.create_profile(text,date,text,text[],text[]), public.my_account(), public.update_profile(text,text,text[],text[],text),
  public.discover(text,text,integer), public.send_letter(text,text,uuid,text,text,uuid),
  public.decide_letter(uuid,boolean), public.send_message(uuid,text,uuid), public.block_explorer(uuid,text),
  public.mark_notifications_read(), public.process_deliveries(integer) from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles, public.wallets, public.blocks, public.letters, public.points_ledger,
  public.conversations, public.messages, public.reports, public.notifications to authenticated;
grant execute on function public.can_interact(uuid), public.can_read_conversation(uuid),
  public.create_profile(text,date,text,text[],text[]), public.my_account(), public.update_profile(text,text,text[],text[],text),
  public.discover(text,text,integer), public.send_letter(text,text,uuid,text,text,uuid),
  public.decide_letter(uuid,boolean), public.send_message(uuid,text,uuid), public.block_explorer(uuid,text),
  public.mark_notifications_read() to authenticated;
grant execute on function public.process_deliveries(integer) to service_role;

comment on table private.birthdays is 'Private, self-declared dates of birth. Not age verification; never return in discovery.';
comment on function public.process_deliveries(integer) is 'Cron/service role only. Transactional, bounded, and safe for overlapping runs.';

-- A public connectivity probe reveals no user data.
create function public.backend_status() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('app', 'pigeon-post', 'schema_version', 1, 'server_time', now())
$$;
grant execute on function public.backend_status() to anon, authenticated;
