-- Release abandoned calls after a disconnected or terminated client stops checking in.
create table private.call_heartbeats (
 call_id uuid references public.calls(id) on delete cascade,
 user_id uuid references public.profiles(id) on delete cascade,
 seen_at timestamptz not null default now(),
 primary key(call_id,user_id)
);
revoke all on private.call_heartbeats from public,anon,authenticated;
create function public.heartbeat_call(p_call uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.calls; u uuid:=private.require_member();
begin
 select * into r from public.calls where id=p_call;
 if not found or u not in(r.caller_id,r.callee_id) or r.status<>'accepted' or r.expires_at<=now() or not public.can_read_conversation(r.conversation_id) then raise exception 'Call unavailable.'; end if;
 insert into private.call_heartbeats(call_id,user_id) values(r.id,u) on conflict(call_id,user_id) do update set seen_at=now();
end $$;
revoke all on function public.heartbeat_call(uuid) from public,anon,authenticated;
grant execute on function public.heartbeat_call(uuid) to authenticated;
create or replace function public.communication_maintenance() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 update public.calls r set status=case when r.status='ringing' then 'missed' else 'ended' end,ended_at=now(),expires_at=now()
 where status in('ringing','accepted') and (expires_at<=now() or (r.status='accepted' and exists(select 1 from (values(r.caller_id),(r.callee_id)) participant(id) where coalesce((select seen_at from private.call_heartbeats h where h.call_id=r.id and h.user_id=participant.id),r.answered_at)<now()-interval '45 seconds')) or not private.is_premium(caller_id) or not exists(select 1 from public.conversations c where c.id=r.conversation_id and c.closed_at is null and private.same_circle(c.member_a,c.member_b)));
 insert into private.call_cleanup(id) select id from public.calls where status in('ended','declined','missed') and ended_at>now()-interval '5 minutes' on conflict do nothing;
 delete from private.push_jobs where created_at<now()-interval '2 days';
 return jsonb_build_object('rooms',(select coalesce(jsonb_agg(id),'[]') from (select id from private.call_cleanup limit 100) r),
 'files',(select coalesce(jsonb_agg(path),'[]') from (select path from private.storage_cleanup limit 100) f));
end $$;
