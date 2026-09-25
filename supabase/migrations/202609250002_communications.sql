-- Chat state is scoped to accepted, open conversations. No public presence channels.
create table public.chat_activity (
 conversation_id uuid references public.conversations(id) on delete cascade,
 user_id uuid references public.profiles(id) on delete cascade,
 typing_until timestamptz not null default 'epoch',
 read_at timestamptz not null default 'epoch',
 primary key(conversation_id,user_id)
);
alter table public.chat_activity enable row level security;
create policy chat_activity_members on public.chat_activity for select to authenticated using(public.can_read_conversation(conversation_id));
revoke all on public.chat_activity from public,anon,authenticated;
grant select on public.chat_activity to authenticated;
create function public.set_chat_typing(p_conversation uuid,p_typing boolean) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_member();
begin
 if not public.can_read_conversation(p_conversation) then raise exception 'Conversation unavailable.'; end if;
 insert into public.chat_activity(conversation_id,user_id,typing_until) values(p_conversation,u,case when p_typing then clock_timestamp()+interval '5 seconds' else 'epoch' end)
 on conflict(conversation_id,user_id) do update set typing_until=excluded.typing_until;
end $$;
-- The cursor is a message actually rendered by the client, never a client clock.
create function public.mark_chat_read(p_conversation uuid,p_message uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_member(); stamp timestamptz;
begin
 if not public.can_read_conversation(p_conversation) then raise exception 'Conversation unavailable.'; end if;
 select created_at into stamp from public.messages where id=p_message and conversation_id=p_conversation;
 if stamp is null then raise exception 'Message unavailable.'; end if;
 insert into public.chat_activity(conversation_id,user_id,read_at) values(p_conversation,u,stamp)
 on conflict(conversation_id,user_id) do update set read_at=greatest(public.chat_activity.read_at,excluded.read_at);
end $$;

create table public.chat_attachments (
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null unique references public.messages(id) on delete cascade,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 owner_id uuid not null references public.profiles(id) on delete cascade,
 path text not null unique,
 name text not null check(length(name) between 1 and 120),
 mime text not null check(mime in ('image/jpeg','image/png','image/webp','application/pdf','text/plain')),
 bytes integer not null check(bytes between 1 and 10485760),
 created_at timestamptz not null default now()
);
alter table public.chat_attachments enable row level security;
create policy attachment_members on public.chat_attachments for select to authenticated using(public.can_read_conversation(conversation_id));
revoke all on public.chat_attachments from public,anon,authenticated;
grant select on public.chat_attachments to authenticated;
-- Only the upload Edge Function may publish validated attachment metadata.
create function public.publish_attachment(p_user uuid,p_conversation uuid,p_client uuid,p_path text,p_name text,p_mime text,p_bytes integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.conversations; m public.messages;
begin
 perform 1 from public.wallets where user_id=p_user for update;
 select * into c from public.conversations where id=p_conversation;
 if not found or p_user not in(c.member_a,c.member_b) or c.closed_at is not null or not private.same_circle(c.member_a,c.member_b) then raise exception 'Conversation unavailable.'; end if;
 perform 1 from public.profiles where id in(c.member_a,c.member_b) order by id for update;
 if not private.same_circle(c.member_a,c.member_b) then raise exception 'Conversation unavailable.'; end if;
 select * into m from public.messages where sender_id=p_user and client_id=p_client;
 if found then
  if m.conversation_id<>p_conversation or not exists(select 1 from public.chat_attachments where message_id=m.id and path=p_path) then raise exception 'Request ID reused.'; end if;
  return m.id;
 end if;
 if p_client is null or p_path<>p_user::text||'/'||p_conversation::text||'/'||p_client::text then raise exception 'Invalid upload path.'; end if;
 if (select count(*) from public.messages where sender_id=p_user and created_at>now()-interval '1 minute')>=30 then raise exception 'Please slow down.'; end if;
 if (select coalesce(sum(bytes),0) from public.chat_attachments where owner_id=p_user and created_at>now()-interval '24 hours')+p_bytes>104857600 then raise exception 'Daily file limit reached (100 MB).'; end if;
 insert into public.messages(conversation_id,sender_id,body,client_id) values(p_conversation,p_user,'Shared a file: '||p_name,p_client) returning * into m;
 insert into public.chat_attachments(message_id,conversation_id,owner_id,path,name,mime,bytes) values(m.id,p_conversation,p_user,p_path,p_name,p_mime,p_bytes);
 return m.id;
end $$;

create table public.calls (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 caller_id uuid not null references public.profiles(id) on delete cascade,
 callee_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in('voice','video')),
 status text not null default 'ringing' check(status in('ringing','accepted','declined','ended','missed')),
 client_id uuid not null,
 created_at timestamptz not null default now(),
 answered_at timestamptz,
 ended_at timestamptz,
 expires_at timestamptz not null,
 unique(caller_id,client_id), check(caller_id<>callee_id)
);
create index calls_active on public.calls(conversation_id,status);
alter table public.calls enable row level security;
create policy calls_members on public.calls for select to authenticated using(auth.uid() in(caller_id,callee_id) and public.can_read_conversation(conversation_id));
revoke all on public.calls from public,anon,authenticated;
grant select on public.calls to authenticated;
create function public.start_call(p_conversation uuid,p_kind text,p_client uuid) returns public.calls
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_member(); c public.conversations; r public.calls; until_at timestamptz;
begin
 select * into c from public.conversations where id=p_conversation for update;
 if not public.can_read_conversation(p_conversation) then raise exception 'Conversation unavailable.'; end if;
 -- Lock both participants in stable order: concurrent calls across rooms cannot overlap.
 perform 1 from public.profiles where id in(c.member_a,c.member_b) order by id for update;
 if not public.can_read_conversation(p_conversation) then raise exception 'Conversation unavailable.'; end if;
 if not private.is_premium(u) then raise exception 'Pigeon Plus is required to start calls.'; end if;
 select * into r from public.calls where caller_id=u and client_id=p_client;
 if found then
  if r.conversation_id<>p_conversation or r.kind<>p_kind then raise exception 'Request ID reused.'; end if;
  return r;
 end if;
 if p_kind not in('voice','video') or p_client is null then raise exception 'Invalid call.'; end if;
 if exists(select 1 from public.calls where status in('ringing','accepted') and expires_at>now() and (caller_id in(c.member_a,c.member_b) or callee_id in(c.member_a,c.member_b))) then raise exception 'One of you is already on a call.'; end if;
 if (select count(*) from public.calls where caller_id=u and created_at>now()-interval '1 hour')>=20 then raise exception 'Call limit reached. Try later.'; end if;
 select expires_at into until_at from public.premium_memberships where user_id=u;
 insert into public.calls(conversation_id,caller_id,callee_id,kind,client_id,expires_at)
 values(c.id,u,case when c.member_a=u then c.member_b else c.member_a end,p_kind,p_client,least(until_at,now()+interval '45 seconds')) returning * into r;
 return r;
end $$;
create function public.answer_call(p_call uuid,p_accept boolean) returns public.calls
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_member(); r public.calls; until_at timestamptz;
begin
 select * into r from public.calls where id=p_call for update;
 if not found or r.callee_id<>u or not public.can_read_conversation(r.conversation_id) then raise exception 'Call unavailable.'; end if;
 if r.status='accepted' and p_accept and r.expires_at>now() then return r; end if;
 if r.status<>'ringing' or r.expires_at<=now() or not private.is_premium(r.caller_id) then raise exception 'Call has ended.'; end if;
 select expires_at into until_at from public.premium_memberships where user_id=r.caller_id;
 update public.calls set status=case when p_accept then 'accepted' else 'declined' end,
 answered_at=case when p_accept then now() end,ended_at=case when not p_accept then now() end,
 expires_at=case when p_accept then least(until_at,now()+interval '2 hours') else now() end where id=r.id returning * into r;
 return r;
end $$;
create function public.end_call(p_call uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.calls set status='ended',ended_at=now(),expires_at=now() where id=p_call and auth.uid() in(caller_id,callee_id) and status in('ringing','accepted');
end $$;

create table private.push_devices (
 token text primary key check(token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'),
 user_id uuid not null references auth.users(id) on delete cascade,
 updated_at timestamptz not null default now()
);
create function public.register_push_token(p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_member();
begin
 if (select count(*) from private.push_devices where user_id=u and token<>p_token)>=10 then raise exception 'Too many notification devices.'; end if;
 insert into private.push_devices(token,user_id) values(p_token,u) on conflict(token) do update set user_id=u,updated_at=now();
end $$;
create function public.unregister_push_token(p_token text) returns void
language sql security definer set search_path='' as $$ delete from private.push_devices where token=p_token and user_id=auth.uid() $$;
create table private.push_jobs (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 token text not null references private.push_devices(token) on delete cascade,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 message_id uuid references public.messages(id) on delete cascade,
 call_id uuid references public.calls(id) on delete cascade,
 created_at timestamptz not null default now(),
 next_at timestamptz not null default now(),
 attempts integer not null default 0,
 lease uuid,
 ticket text,
 done boolean not null default false
);
create function private.queue_chat_push() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.conversations; recipient uuid;
begin
 select * into c from public.conversations where id=new.conversation_id;
 if tg_table_name='messages' then recipient:=case when c.member_a=new.sender_id then c.member_b else c.member_a end;
 else recipient:=new.callee_id; end if;
 insert into private.push_jobs(user_id,token,conversation_id,message_id,call_id)
 select recipient,d.token,c.id,case when tg_table_name='messages' then new.id end,case when tg_table_name='calls' then new.id end
 from private.push_devices d where d.user_id=recipient and d.updated_at>now()-interval '30 days';
 return new;
end $$;
create trigger message_push after insert on public.messages for each row execute function private.queue_chat_push();
create trigger call_push after insert on public.calls for each row execute function private.queue_chat_push();
create function public.claim_push_jobs() returns setof private.push_jobs language plpgsql security definer set search_path='' as $$
begin
 -- Recheck ownership, membership, blocking and expiry at dispatch time.
 update private.push_jobs j set done=true where not j.done and (j.created_at<now()-interval '24 hours' or j.attempts>=8 or not exists(
 select 1 from private.push_devices d join public.conversations c on c.id=j.conversation_id
 where d.token=j.token and d.user_id=j.user_id and c.closed_at is null and private.same_circle(c.member_a,c.member_b))
 or (j.call_id is not null and not exists(select 1 from public.calls c where c.id=j.call_id and c.status='ringing' and c.expires_at>now())));
 return query update private.push_jobs j set lease=gen_random_uuid(),next_at=now()+interval '2 minutes',attempts=j.attempts+1
 where j.id in(select id from private.push_jobs where not done and next_at<=now() order by id limit 50 for update skip locked) returning j.*;
end $$;
create function public.finish_push_job(p_id bigint,p_lease uuid,p_done boolean,p_ticket text default null,p_invalid boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare j private.push_jobs;
begin
 select * into j from private.push_jobs where id=p_id and lease=p_lease for update;
 if not found then return; end if;
 if p_invalid then delete from private.push_devices where token=j.token and user_id=j.user_id; return; end if;
 update private.push_jobs set done=p_done,ticket=coalesce(p_ticket,ticket),next_at=now()+case when p_ticket is not null then interval '15 minutes' else interval '2 minutes' end where id=p_id;
end $$;
create table private.storage_cleanup(path text primary key,created_at timestamptz not null default now());
create function private.queue_attachment_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into private.storage_cleanup(path) values(old.path) on conflict do nothing; return old; end $$;
create trigger attachment_cleanup after delete on public.chat_attachments for each row execute function private.queue_attachment_cleanup();
create table private.call_cleanup(id uuid primary key,created_at timestamptz not null default now());
create function private.queue_call_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into private.call_cleanup(id) values(old.id) on conflict do nothing; return old; end $$;
create trigger call_delete_cleanup before delete on public.calls for each row execute function private.queue_call_cleanup();
create function public.communication_maintenance() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 update public.calls r set status=case when r.status='ringing' then 'missed' else 'ended' end,ended_at=now(),expires_at=now()
 where status in('ringing','accepted') and (expires_at<=now() or not private.is_premium(caller_id) or not exists(select 1 from public.conversations c where c.id=r.conversation_id and c.closed_at is null and private.same_circle(c.member_a,c.member_b)));
 insert into private.call_cleanup(id) select id from public.calls where status in('ended','declined','missed') and ended_at>now()-interval '5 minutes' on conflict do nothing;
 delete from private.push_jobs where created_at<now()-interval '2 days';
 return jsonb_build_object('rooms',(select coalesce(jsonb_agg(id),'[]') from (select id from private.call_cleanup limit 100) r),
 'files',(select coalesce(jsonb_agg(path),'[]') from (select path from private.storage_cleanup limit 100) f));
end $$;
create function public.finish_communication_cleanup(p_room uuid default null,p_path text default null) returns void language sql security definer set search_path='' as $$
 delete from private.call_cleanup where id=p_room;
 delete from private.storage_cleanup where path=p_path;
$$;

revoke all on all tables in schema private from public,anon,authenticated;
revoke all on function public.set_chat_typing(uuid,boolean),public.mark_chat_read(uuid,uuid),public.publish_attachment(uuid,uuid,uuid,text,text,text,integer),public.start_call(uuid,text,uuid),public.answer_call(uuid,boolean),public.end_call(uuid),public.register_push_token(text),public.unregister_push_token(text),public.claim_push_jobs(),public.finish_push_job(bigint,uuid,boolean,text,boolean),public.communication_maintenance(),public.finish_communication_cleanup(uuid,text) from public,anon,authenticated;
grant execute on function public.set_chat_typing(uuid,boolean),public.mark_chat_read(uuid,uuid),public.start_call(uuid,text,uuid),public.answer_call(uuid,boolean),public.end_call(uuid),public.register_push_token(text),public.unregister_push_token(text) to authenticated;
grant execute on function public.publish_attachment(uuid,uuid,uuid,text,text,text,integer),public.claim_push_jobs(),public.finish_push_job(bigint,uuid,boolean,text,boolean),public.communication_maintenance(),public.finish_communication_cleanup(uuid,text) to service_role;
revoke all on function private.queue_chat_push(),private.queue_attachment_cleanup(),private.queue_call_cleanup() from public,anon,authenticated;

grant select on public.calls,public.chat_attachments,public.premium_memberships to service_role;
