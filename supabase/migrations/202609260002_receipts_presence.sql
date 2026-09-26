-- Delivery is acknowledged by the recipient client, never inferred from a push ticket.
create table public.message_receipts (
 message_id uuid primary key references public.messages(id) on delete cascade,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 delivered_at timestamptz not null default now(),
 read_at timestamptz
);
create index message_receipts_conversation on public.message_receipts(conversation_id);
alter table public.message_receipts enable row level security;
create policy receipt_members on public.message_receipts for select to authenticated using(public.can_read_conversation(conversation_id));
revoke all on public.message_receipts from public,anon,authenticated;
grant select on public.message_receipts to authenticated;
create function public.acknowledge_messages(p_messages uuid[],p_read boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_member();
begin
 if p_messages is null or cardinality(p_messages)>100 then raise exception 'At most 100 messages allowed.'; end if;
 if exists(select 1 from unnest(p_messages) x(id) left join public.messages m on m.id=x.id
   where m.id is null or m.sender_id=u or not public.can_read_conversation(m.conversation_id)) then raise exception 'Message unavailable.'; end if;
 insert into public.message_receipts(message_id,conversation_id,recipient_id,read_at)
 select distinct m.id,m.conversation_id,u,case when p_read then now() end from public.messages m where m.id=any(p_messages)
 on conflict(message_id) do update set read_at=coalesce(public.message_receipts.read_at,excluded.read_at);
end $$;
create function public.pending_message_deliveries() returns setof public.messages
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_member();
begin
 return query select m.* from public.messages m where m.sender_id<>u and public.can_read_conversation(m.conversation_id)
 and not exists(select 1 from public.message_receipts r where r.message_id=m.id)
 order by m.created_at,m.id limit 100;
end $$;
-- Separate heartbeats per app/tab: closing one device cannot mark another offline.
create table private.presence_sessions (
 session_id uuid primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 seen_at timestamptz not null default now(),
 online_until timestamptz not null
);
create index presence_user on private.presence_sessions(user_id);
revoke all on private.presence_sessions from public,anon,authenticated;
create function public.update_presence(p_session uuid,p_online boolean) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_member();
begin
 if p_session is null or p_online is null then raise exception 'Invalid presence.'; end if;
 delete from private.presence_sessions where user_id=u and seen_at<now()-interval '7 days';
 insert into private.presence_sessions(session_id,user_id,seen_at,online_until)
 values(p_session,u,now(),case when p_online then now()+interval '60 seconds' else now() end)
 on conflict(session_id) do update set seen_at=now(),online_until=excluded.online_until where private.presence_sessions.user_id=u;
 if not found then raise exception 'Session unavailable.'; end if;
end $$;
create function public.conversation_presence(p_conversation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_member(); peer uuid; last_seen timestamptz; until_at timestamptz;
begin
 if not public.can_read_conversation(p_conversation) then raise exception 'Conversation unavailable.'; end if;
 select case when member_a=u then member_b else member_a end into peer from public.conversations where id=p_conversation;
 select max(seen_at),max(online_until) into last_seen,until_at from private.presence_sessions where user_id=peer;
 return jsonb_build_object('online',coalesce(until_at>now(),false),'last_seen',last_seen,
 'online_seconds',greatest(0,coalesce(extract(epoch from until_at-now()),0)));
end $$;
revoke all on function public.acknowledge_messages(uuid[],boolean),public.pending_message_deliveries(),public.update_presence(uuid,boolean),public.conversation_presence(uuid) from public,anon,authenticated;
grant execute on function public.acknowledge_messages(uuid[],boolean),public.pending_message_deliveries(),public.update_presence(uuid,boolean),public.conversation_presence(uuid) to authenticated;
alter publication supabase_realtime add table public.message_receipts;
