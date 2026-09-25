-- Run in the selected project's SQL Editor after applying all migrations.
-- Expected schema_version: 2.
select public.backend_status();

-- Exactly one active once-per-minute worker should appear.
select jobname, schedule, active from cron.job where jobname = 'pigeon-post-deliveries';

-- Should include letters, conversations, messages, notifications.
select tablename from pg_publication_tables where pubname = 'supabase_realtime'
  and tablename in ('letters','conversations','messages','notifications') order by tablename;

-- All rows should show RLS enabled; birthdays/attempts stay in private.
select schemaname, tablename, rowsecurity from pg_tables
where (schemaname = 'public' and tablename in ('profiles','wallets','blocks','letters','points_ledger','conversations','messages','reports','notifications'))
   or (schemaname = 'private' and tablename in ('birthdays','delivery_attempts'))
order by schemaname, tablename;

-- Expected: false, false, false, true.
select has_function_privilege('anon', 'public.send_letter(text,text,uuid,text,text,uuid)', 'execute') as anonymous_send,
  has_function_privilege('authenticated', 'public.process_deliveries(integer)', 'execute') as client_worker,
  has_table_privilege('authenticated', 'public.wallets', 'update') as client_wallet_update,
  has_function_privilege('service_role', 'public.process_deliveries(integer)', 'execute') as worker_allowed;

-- A failed run appears here once the worker has actually run.
select status, return_message, start_time, end_time from cron.job_run_details
where jobid in (select jobid from cron.job where jobname = 'pigeon-post-deliveries')
order by start_time desc limit 10;

-- Account tools: expected false, true, false, true.
select has_function_privilege('anon', 'public.delete_account(text)', 'execute') as anonymous_delete,
  has_function_privilege('authenticated', 'public.delete_account(text)', 'execute') as self_delete,
  has_function_privilege('authenticated', 'public.review_report(uuid,text,boolean)', 'execute') as client_moderation,
  has_function_privilege('service_role', 'public.review_report(uuid,text,boolean)', 'execute') as operator_moderation;
