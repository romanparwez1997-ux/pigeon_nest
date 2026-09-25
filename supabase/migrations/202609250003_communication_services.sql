-- Infrastructure kept separate from portable transactional tests.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('chat-files','chat-files',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','text/plain'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Uploads go through authenticated byte validation in the Edge Function.
create policy chat_file_read on storage.objects for select to authenticated using(bucket_id='chat-files' and exists(
 select 1 from public.chat_attachments a where a.path=storage.objects.name and public.can_read_conversation(a.conversation_id)));
alter publication supabase_realtime add table public.chat_activity;
alter publication supabase_realtime add table public.chat_attachments;
alter publication supabase_realtime add table public.calls;
-- Maintenance invalidates expired/blocked calls even before external services are configured.
select cron.schedule('pigeon-communication-maintenance','* * * * *','select public.communication_maintenance()');
create extension if not exists pg_net with schema extensions;
-- Secret values are configured separately; nothing sensitive is committed.
create function private.dispatch_communications() returns void language plpgsql security definer set search_path='' as $$
declare endpoint text; token text;
begin
 if not exists(select 1 from private.push_jobs where not done and next_at<=now()) and not exists(select 1 from private.call_cleanup) and not exists(select 1 from private.storage_cleanup) then return; end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='pigeon_communication_url' limit 1;
 select decrypted_secret into token from vault.decrypted_secrets where name='pigeon_communication_secret' limit 1;
 if endpoint is not null and token is not null then
  perform net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=5000);
 end if;
end $$;
revoke all on function private.dispatch_communications() from public,anon,authenticated;
select cron.schedule('pigeon-communication-dispatch','10 seconds','select private.dispatch_communications()');
