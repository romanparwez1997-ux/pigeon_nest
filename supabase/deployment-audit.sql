-- Read-only deployment evidence. Run with `supabase db query --linked --file`.
select jsonb_build_object(
  'backend', public.backend_status(),
  'migrations', (select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
  'tables', (select jsonb_agg(jsonb_build_object('schema', schemaname, 'table', tablename, 'rls', rowsecurity) order by schemaname, tablename)
    from pg_tables where schemaname in ('public','private')),
  'realtime', (select jsonb_agg(tablename order by tablename) from pg_publication_tables where pubname = 'supabase_realtime'),
  'delivery_jobs', (select jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule, 'active', active))
    from cron.job where jobname = 'pigeon-post-deliveries'),
  'latest_delivery_run', (select jsonb_build_object('status', status, 'result', return_message, 'started', start_time, 'ended', end_time)
    from cron.job_run_details where jobid in (select jobid from cron.job where jobname = 'pigeon-post-deliveries') order by start_time desc limit 1),
  'privileges', jsonb_build_object(
    'anon_can_send', has_function_privilege('anon', 'public.send_letter(text,text,uuid,text,text,uuid)', 'execute'),
    'client_can_run_worker', has_function_privilege('authenticated', 'public.process_deliveries(integer)', 'execute'),
    'client_can_update_wallet', has_table_privilege('authenticated', 'public.wallets', 'update'),
    'client_can_moderate', has_function_privilege('authenticated', 'public.review_report(uuid,text,boolean)', 'execute'),
    'client_can_delete_self', has_function_privilege('authenticated', 'public.delete_account(text)', 'execute'),
    'service_can_run_worker', has_function_privilege('service_role', 'public.process_deliveries(integer)', 'execute'),
    'service_can_moderate', has_function_privilege('service_role', 'public.review_report(uuid,text,boolean)', 'execute')
  ),
  'auth_user_count', (select count(*) from auth.users),
  'profile_count', (select count(*) from public.profiles)
) as deployment;
