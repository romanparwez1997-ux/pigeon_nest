import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to authenticated, anon, service_role;
    create publication supabase_realtime;
    -- PGlite cannot run pg_cron. This stub only checks bundle transactionality;
    -- the real cron extension and its execution require hosted verification.
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid,bucket_id text,name text);
    alter table storage.objects enable row level security;
    create schema vault;
    create view vault.decrypted_secrets as select null::text as name,null::text as decrypted_secret where false;
    create schema net;
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;
    create schema cron;
    create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
  `);
  const sql = (await readFile(new URL('../../supabase/setup.sql', import.meta.url), 'utf8'))
    .replaceAll('create extension if not exists pg_cron with schema pg_catalog;', '-- pg_cron unavailable in embedded PostgreSQL').replaceAll('create extension if not exists pg_net with schema extensions;', '-- pg_net unavailable in embedded PostgreSQL');
  return { db, sql };
}

test('SQL Editor setup installs schema/history atomically and refuses to overwrite an existing app', async () => {
  const { db, sql } = await fixture();
  try {
    await db.exec(sql);
    assert.equal((await db.query('select public.backend_status() as s')).rows[0].s.schema_version, 2);
    assert.deepEqual((await db.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(r => r.version), ['202609240001', '202609240002', '202609240003', '202609250001', '202609250002', '202609250003', '202609250004']);
    assert.equal((await db.query("select count(*)::int as n from pg_publication_tables where pubname='supabase_realtime'")).rows[0].n, 7);
    await assert.rejects(() => db.exec(sql), /already has application tables/);
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int as n from supabase_migrations.schema_migrations')).rows[0].n, 7);
  } finally { await db.close(); }
});

test('SQL Editor setup rolls back all schema/history changes when a statement fails', async () => {
  const { db, sql } = await fixture();
  try {
    await assert.rejects(() => db.exec(sql.replace('\ncommit;', '\nselect intentionally_missing_setup_check();\ncommit;')), /does not exist/);
    await db.exec('rollback');
    const { rows } = await db.query("select to_regclass('public.profiles') as profiles, to_regclass('supabase_migrations.schema_migrations') as migrations");
    assert.equal(rows[0].profiles, null);
    assert.equal(rows[0].migrations, null);
  } finally { await db.close(); }
});
