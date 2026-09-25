create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('pigeon-post-deliveries', '* * * * *', 'select public.process_deliveries(100)');

-- Postgres Changes respects each subscriber's row-level SELECT policies.
alter publication supabase_realtime add table public.letters;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
