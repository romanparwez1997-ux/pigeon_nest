import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const ids = {
  a: '10000000-0000-4000-8000-000000000001',
  b: '20000000-0000-4000-8000-000000000002',
  c: '30000000-0000-4000-8000-000000000003',
  adult: '40000000-0000-4000-8000-000000000004',
  stranger: '50000000-0000-4000-8000-000000000005',
};
const body = 'A little hello from my corner of the world. What are you reading?';

test('PostgreSQL migrations, RPCs, and row-level security', async t => {
  const db = new PGlite();
  const q = async (sql, args = []) => {
    try { return (await db.query(sql, args)).rows; }
    catch (e) { throw new Error(`${e.message}${e.detail ? `: ${e.detail}` : ''}`); }
  };
  const admin = () => db.exec('reset role');
  const user = async id => {
    await db.exec('reset role; set local role authenticated');
    await q("select set_config('request.jwt.claim.sub', $1, true)", [id]);
  };
  const denied = async (sql, args, pattern = /permission|unavailable|eligible|Sign in/i) => {
    await db.exec('savepoint expected_failure');
    try { await assert.rejects(() => q(sql, args), pattern); }
    finally { await db.exec('rollback to expected_failure; release expected_failure'); }
  };
  const fixture = async () => {
    for (const [name, id] of Object.entries(ids)) {
      await user(id);
      await q("select public.create_profile($1, (current_date - make_interval(years => $2::int))::date, $3, array['Books','Art','Travel'])", [name, name === 'adult' ? 25 : 17, name === 'stranger' ? 'Brazil' : 'Finland']);
    }
    await user(ids.a);
  };
  const send = async (target = ids.b, key = randomUUID(), kind = 'person') => {
    const rows = await q('select public.send_letter($1, $2, $3, $4, $5, $6) as id', [body, 'pigeon', key, kind, kind === 'country' ? 'Finland' : null, kind === 'person' ? target : null]);
    return rows[0].id;
  };
  const arrive = async id => {
    await admin();
    await q("update public.letters set arrives_at = now() - interval '1 second' where id = $1", [id]);
    await q('select public.process_deliveries(100)');
  };
  const run = async (name, fn) => t.test(name, async () => {
    await db.exec('begin');
    try { await fixture(); await fn(); }
    finally { await db.exec('rollback'); }
  });
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth to authenticated, anon, service_role;
      grant execute on function auth.uid() to authenticated, anon, service_role;
    `);
    for (const id of Object.values(ids)) await q('insert into auth.users values ($1)', [id]);
    const migration = await readFile(new URL('../../supabase/migrations/202609240001_core.sql', import.meta.url), 'utf8');
    try { await db.exec(migration); } catch(e) { throw new Error(`Migration failed: ${e.message}; position ${e.position || '?'}; ${e.where || ''}`); }
    await db.exec(await readFile(new URL('../../supabase/migrations/202609240003_account_tools.sql', import.meta.url), 'utf8'));

    await db.exec(await readFile(new URL('../../supabase/migrations/202609250001_rewards_and_premium.sql', import.meta.url), 'utf8'));
    await run('daily gifts cannot reroll, double credit, or cross account boundaries', async () => {
      const first = (await q('select public.claim_daily_reward() as reward'))[0].reward;
      const account = (await q('select public.my_account() as a'))[0].a;
      for (let i = 0; i < 8; i++) assert.deepEqual((await q('select public.claim_daily_reward() as reward'))[0].reward, first);
      assert.deepEqual((await q('select public.my_account() as a'))[0].a, account);
      assert.equal(account.points, first.kind === 'points' ? 130 : 120);
      for (const kind of ['pigeon', 'postman', 'riddle']) assert.equal(account.rewards[kind], first.kind === kind ? 1 : 0);
      await denied("update public.wallets set pigeon_passes=999", [], /permission/);
      await denied("insert into public.daily_rewards values($1,current_date,'points',999)", [ids.a], /permission/);
      await user(ids.b);
      assert.equal((await q('select * from public.daily_rewards')).length, 0);
      await db.exec('reset role; set local role anon');
      await denied('select public.claim_daily_reward()', [], /permission/);
    });
    await run('courier passes are consumed once, match their courier, and survive failed sends', async () => {
      await admin(); await q('update public.wallets set pigeon_passes=1, postman_passes=1, points=0 where user_id=$1', [ids.a]); await user(ids.a);
      await denied('select public.send_letter($1,$2,$3,$4,null,$5)', [body,'pigeon',randomUUID(),'person',ids.adult], /available/);
      assert.equal((await q('select pigeon_passes from public.wallets'))[0].pigeon_passes, 1);
      const key = randomUUID(); const id = await send(ids.b, key); assert.equal(await send(ids.b,key), id);
      const wallet = (await q('select * from public.wallets'))[0];
      assert.equal(wallet.points, 0); assert.equal(wallet.pigeon_passes, 0); assert.equal(wallet.postman_passes, 1);
      await denied('select public.send_letter($1,$2,$3,$4,null,$5)', [body,'pigeon',randomUUID(),'person',ids.c], /10 postage points/);
      assert.equal((await q("select * from public.points_ledger where reason='reward_postage'")).length, 1);
    });
    await run('riddle answers stay private; retries cannot consume tokens or award points twice', async () => {
      await admin(); await q('update public.wallets set riddle_tokens=2 where user_id=$1', [ids.a]); await user(ids.a);
      const key=randomUUID(); const r=(await q('select public.start_riddle($1) as r',[key]))[0].r;
      assert.equal((await q('select public.start_riddle($1) as r',[key]))[0].r.id,r.id);
      assert.equal((await q('select public.start_riddle($1) as r',[randomUUID()]))[0].r.id,r.id);
      assert.equal((await q('select riddle_tokens from public.wallets'))[0].riddle_tokens,1);
      await denied('select * from private.riddles',[],/permission/);
      const wrong=(await q('select public.answer_riddle($1,$2) as r',[r.id,'wrong']))[0].r;
      assert.equal(wrong.attempts,1);
      assert.equal((await q('select public.answer_riddle($1,$2) as r',[r.id,' WRONG ']))[0].r.attempts,1);
      await user(ids.b); await denied('select public.answer_riddle($1,$2)',[r.id,'piano'],/unavailable/); assert.equal((await q('select * from public.riddle_rounds')).length,0);
      await admin(); const solution=(await q('select q.answers[1] as answer from private.riddles q join private.riddle_solutions s on s.riddle_id=q.id where s.round_id=$1',[r.id]))[0].answer;
      await user(ids.a);
      assert.equal((await q('select public.answer_riddle($1,$2) as r',[r.id,solution]))[0].r.solved,true);
      await q('select public.answer_riddle($1,$2)',[r.id,solution]);
      assert.equal((await q('select points from public.wallets'))[0].points,140);
      assert.equal((await q("select * from public.points_ledger where reason='riddle'")).length,1);
      assert.equal((await q('select public.start_riddle($1) as r',[key]))[0].r.id,r.id);
      assert.equal((await q('select riddle_tokens from public.wallets'))[0].riddle_tokens,1);
    });
    await run('exhausted and expired riddles cannot award points', async () => {
      await admin(); await q('update public.wallets set riddle_tokens=2 where user_id=$1',[ids.a]); await user(ids.a);
      const r=(await q('select public.start_riddle($1) as r',[randomUUID()]))[0].r;
      for (const answer of ['a wrong guess','another wrong guess','last wrong guess']) await q('select public.answer_riddle($1,$2)',[r.id,answer]);
      await denied('select public.answer_riddle($1,$2)',[r.id,'piano'],/ended/);
      const next=(await q('select public.start_riddle($1) as r',[randomUUID()]))[0].r;
      await admin(); await q("update public.riddle_rounds set expires_at=now()-interval '1 second' where id=$1",[next.id]); await user(ids.a);
      await denied('select public.answer_riddle($1,$2)',[next.id,'piano'],/ended/);
      assert.equal((await q('select points from public.wallets'))[0].points,120);
    });
    await run('only verified billing can grant Plus; allowance retries and stale updates are harmless', async () => {
      await denied("select public.apply_premium_status($1,now()+interval '1 month',now(),'monthly')",[ids.a],/permission/);
      await admin();
      await q("select public.apply_premium_status($1,now()+interval '1 month',now(),'monthly')",[ids.a]);
      await q("select public.apply_premium_status($1,now()+interval '1 month',now(),'monthly')",[ids.a]);
      await user(ids.a); const a=(await q('select public.my_account() as a'))[0].a;
      assert.equal(a.premium,true); assert.equal(a.points,220);
      await admin(); await q("select public.apply_premium_status($1,null,null,'',now()-interval '1 hour')",[ids.a]);
      await user(ids.a); assert.equal((await q('select public.my_account() as a'))[0].a.premium,true);
      await admin(); await q("select public.apply_premium_status($1,null,null,'')",[ids.a]);
      await user(ids.a); assert.equal((await q('select public.my_account() as a'))[0].a.premium,false);
      assert.equal((await q('select points from public.wallets'))[0].points,220);
    });
    await run('Plus letter limits are enforced on the server and never remove daily limits', async () => {
      const peers=[];
      for(let i=0;i<10;i++) {
        const id=randomUUID(); peers.push(id); await admin(); await q('insert into auth.users values($1)',[id]); await user(id);
        await q("select public.create_profile($1,(current_date-interval '17 years')::date,'Finland',array['Books','Art','Travel'])",['peer'+i]);
      }
      await user(ids.a);
      for(let i=0;i<5;i++) await send(peers[i]);
      await denied('select public.send_letter($1,$2,$3,$4,null,$5)',[body,'pigeon',randomUUID(),'person',peers[5]],/active-letter limit/);
      await admin(); await q("select public.apply_premium_status($1,now()+interval '1 month',now(),'monthly')",[ids.a]); await user(ids.a);
      for(let i=5;i<10;i++) await send(peers[i]);
      await denied('select public.send_letter($1,$2,$3,$4,null,$5)',[body,'pigeon',randomUUID(),'person',ids.b],/active-letter limit/);
      await admin(); await q("update public.letters set status='expired' where sender_id=$1",[ids.a]); await user(ids.a);
      for(let i=0;i<10;i++) await send(peers[i]);
      await admin(); await q("update public.letters set status='expired' where sender_id=$1",[ids.a]); await user(ids.a);
      await denied('select public.send_letter($1,$2,$3,$4,null,$5)',[body,'pigeon',randomUUID(),'person',ids.b],/daily letter limit/);
    });
    await run('private birthdates and wallets are not exposed; clients cannot mint points', async () => {
      const profiles = await q('select id from public.profiles');
      assert.ok(!profiles.some(p => p.id === ids.adult));
      assert.equal((await q('select * from public.wallets')).length, 1);
      assert.equal((await q('select public.my_account() as account'))[0].account.points, 120);
      await denied('select * from private.birthdays', [], /permission/);
      await denied('update public.wallets set points = 99999', [], /permission/);
      await denied("update public.profiles set active = true", [], /permission/);
      await denied('select public.process_deliveries(100)', [], /permission/);
    });
    await run('signup rejects under-16 birthdates and cannot repeat welcome credit', async () => {
      await denied("select public.create_profile('Again', (current_date - interval '17 years')::date, 'Finland', array['Books','Art','Travel'])", [], /already exists/);
      await admin();
      const child = randomUUID(); await q('insert into auth.users values($1)', [child]);
      await user(child);
      await denied("select public.create_profile('Child', (current_date - interval '15 years')::date, 'Finland', array['Books','Art','Travel'])", [], /at least 16/);
      assert.equal((await q('select public.my_account() as account'))[0].account, null);
    });
    await run('idempotent sends debit once and do not reveal an in-transit letter', async () => {
      const key = randomUUID(); const id = await send(ids.b, key);
      assert.equal(await send(ids.b, key), id);
      assert.equal((await q('select points from public.wallets'))[0].points, 110);
      assert.equal((await q('select * from public.points_ledger')).length, 2);
      await user(ids.b);
      assert.equal((await q('select * from public.letters')).length, 0);
      await denied('select public.decide_letter($1, true)', [id], /not available/);
      await arrive(id); await user(ids.b);
      assert.equal((await q('select * from public.letters')).length, 1);
      assert.equal((await q('select * from public.notifications')).length, 1);
    });
    await run('no chat until recipient accepts; acceptance and message retries are idempotent', async () => {
      const id = await send();
      await denied('select public.decide_letter($1, true)', [id]);
      assert.equal((await q('select * from public.conversations')).length, 0);
      await arrive(id); await user(ids.b);
      const room = (await q('select public.decide_letter($1,true) as id', [id]))[0].id;
      assert.equal((await q('select public.decide_letter($1,true) as id', [id]))[0].id, room);
      const key = randomUUID();
      const message = (await q('select public.send_message($1,$2,$3) as id', [room, 'Hello back!', key]))[0].id;
      assert.equal((await q('select public.send_message($1,$2,$3) as id', [room, 'Hello back!', key]))[0].id, message);
      assert.equal((await q('select * from public.messages')).length, 2);
      await user(ids.c);
      assert.equal((await q('select * from public.messages')).length, 0);
      await denied('select public.send_message($1,$2,$3)', [room, 'Not a member', randomUUID()]);
    });
    await run('targeting cannot cross age groups or fall back to an unintended destination', async () => {
      await denied('select public.send_letter($1,$2,$3,$4,$5,$6)', [body, 'pigeon', randomUUID(), 'person', null, ids.adult], /No available/);
      await denied('select public.send_letter($1,$2,$3,$4,$5,$6)', [body, 'pigeon', randomUUID(), 'country', 'Japan', null], /No available/);
      assert.equal((await q('select points from public.wallets'))[0].points, 120);
      const direct = await send(); await arrive(direct); await user(ids.b);
      await q('select public.decide_letter($1,false)', [direct]);
      await user(ids.a);
      assert.equal((await q('select status from public.letters where id=$1', [direct]))[0].status, 'expired');
    });
    await run('country letters reroute within country and remove the prior recipient’s access', async () => {
      const id = await send(null, randomUUID(), 'country'); await arrive(id);
      const recipient = (await q('select recipient_id from public.letters where id=$1', [id]))[0].recipient_id;
      await user(recipient); await q('select public.decide_letter($1,false)', [id]);
      assert.equal((await q('select * from public.letters where id=$1', [id])).length, 0);
      await user(ids.a);
      const next = (await q('select * from public.letters where id=$1', [id]))[0];
      assert.equal(next.attempt_count, 2);
      assert.notEqual(next.recipient_id, recipient);
      assert.ok([ids.b, ids.c].includes(next.recipient_id));
      assert.equal((await q('select points from public.wallets'))[0].points, 110);
    });
    await run('blocking removes discovery, message reads, and future sends', async () => {
      const id = await send(); await arrive(id); await user(ids.b);
      const room = (await q('select public.decide_letter($1,true) as id', [id]))[0].id;
      await q('select public.block_explorer($1,$2)', [ids.a, 'Unwanted contact']);
      assert.equal((await q('select * from public.messages')).length, 0);
      assert.equal((await q('select * from public.reports')).length, 1);
      await user(ids.a);
      assert.equal((await q('select * from public.reports')).length, 0);
      await denied('select public.send_message($1,$2,$3)', [room, 'A blocked message', randomUUID()]);
      await denied('select public.send_letter($1,$2,$3,$4,$5,$6)', [body, 'pigeon', randomUUID(), 'person', null, ids.b], /No available/);
    });
    await run('turning 18 revokes old teen chat access at query time', async () => {
      const id = await send(); await arrive(id); await user(ids.b);
      const room = (await q('select public.decide_letter($1,true) as id', [id]))[0].id;
      await admin(); await q("update private.birthdays set birthday = (current_date - interval '18 years')::date where user_id=$1", [ids.b]);
      await user(ids.a);
      assert.equal((await q('select * from public.messages')).length, 0);
      await denied('select public.send_message($1,$2,$3)', [room, 'Old teen conversation', randomUUID()]);
    });
    await run('worker catches due deliveries and closes unanswered direct mail', async () => {
      const id = await send(); await arrive(id);
      await q("update public.letters set respond_by = now() - interval '1 second' where id=$1", [id]);
      await q('select public.process_deliveries(100)');
      assert.equal((await q('select status from public.letters where id=$1', [id]))[0].status, 'expired');
      await q('select public.process_deliveries(100)');
      assert.equal((await q('select count(*)::int as n from public.notifications'))[0].n, 1);
    });
    await run('anonymous clients cannot discover people or call application mutations', async () => {
      await db.exec('set local role anon');
      await denied('select * from public.profiles', [], /permission/);
      await denied('select public.discover()', [], /permission/);
      await denied('select public.send_letter($1,$2,$3)', [body, 'pigeon', randomUUID()], /permission/);
      for (const sql of ["select public.delete_account('DELETE')", 'select public.unblock_explorer(null)', 'select public.report_explorer(null,null)', 'select public.message_history(null)', 'select public.mark_notifications_read()']) {
        await denied(sql, [], /permission/);
      }
    });
    await run('profile edits preserve private birthday and reject invalid interests', async () => {
      const before = (await q('select public.my_account() as a'))[0].a;
      await q("select public.update_profile('New name','India',array['Books','Art','Travel'],array['en','hi'],'Hello from India')");
      const after = (await q('select public.my_account() as a'))[0].a;
      assert.equal(after.birthday, before.birthday);
      assert.equal(after.points, before.points);
      assert.equal(after.profile.country, 'India');
      assert.deepEqual(after.profile.languages, ['en', 'hi']);
      await denied("select public.update_profile('Name','India',array['Books','Books','Books'],array['en'],'')", [], /check constraint/);
      await user(ids.b);
      assert.equal((await q('select name from public.profiles where id=$1', [ids.a]))[0].name, 'New name');
    });
    await run('reports can be filed without blocking, deduplicate retries, and stay private', async () => {
      const id = (await q('select public.report_explorer($1,$2) as id', [ids.b, 'Unwanted contact']))[0].id;
      assert.equal((await q('select public.report_explorer($1,$2) as id', [ids.b, 'Unwanted contact']))[0].id, id);
      assert.equal((await q('select * from public.blocks')).length, 0);
      await denied('select public.report_explorer($1,$2)', [ids.adult, 'Not in my circle']);
      await denied('select public.report_explorer($1,$2)', [ids.b, ' '], /report reason/);
      await q('select public.block_explorer($1,$2)', [ids.b, 'Unwanted contact']);
      assert.equal((await q('select * from public.reports')).length, 1);
      await user(ids.b);
      assert.equal((await q('select * from public.reports')).length, 0);
    });
    await run('unblocking is owner-only and requires renewed consent before chat access', async () => {
      const id = await send(); await arrive(id); await user(ids.b);
      const room = (await q('select public.decide_letter($1,true) as id', [id]))[0].id;
      await user(ids.a); await q('select public.block_explorer($1)', [ids.b]);
      await user(ids.b); await q('select public.unblock_explorer($1)', [ids.a]);
      assert.equal((await q('select public.can_interact($1) as allowed', [ids.a]))[0].allowed, false);
      await user(ids.a); await q('select public.unblock_explorer($1)', [ids.b]);
      assert.equal((await q('select public.can_interact($1) as allowed', [ids.b]))[0].allowed, true);
      assert.equal((await q('select * from public.messages')).length, 0);
      await denied('select public.send_message($1,$2,$3)', [room, 'No renewed consent', randomUUID()]);
      await user(ids.b); await denied('select public.decide_letter($1,true)', [id], /not available/);
      await user(ids.a); const fresh = await send(); await arrive(fresh); await user(ids.b);
      assert.equal((await q('select public.decide_letter($1,true) as id', [fresh]))[0].id, room);
      assert.equal((await q('select * from public.messages')).length, 2);
    });
    await run('timestamp ties paginate without missing or repeating messages and still enforce RLS', async () => {
      const id = await send(); await arrive(id); await user(ids.b);
      const room = (await q('select public.decide_letter($1,true) as id', [id]))[0].id;
      for (let i = 0; i < 5; i++) await q('select public.send_message($1,$2,$3)', [room, `message ${i}`, randomUUID()]);
      const all = []; let cursor = null;
      for (let i = 0; i < 4; i++) {
        const rows = await q('select * from public.message_history($1,$2,$3,2)', [room, cursor?.created_at ?? null, cursor?.id ?? null]);
        all.push(...rows); cursor = rows.at(-1);
        if (!rows.length) break;
      }
      assert.equal(all.length, 6);
      assert.equal(new Set(all.map(m => m.id)).size, 6);
      await user(ids.c);
      assert.equal((await q('select * from public.message_history($1)', [room])).length, 0);
    });
    await run('notification marking only changes the caller’s shown notifications', async () => {
      const first = await send(); await arrive(first); await user(ids.b);
      const firstNotice = (await q('select * from public.notifications'))[0];
      await q('select public.decide_letter($1,true)', [first]);
      await user(ids.c); const second = await send(ids.b); await arrive(second); await user(ids.b);
      await q('select public.mark_notifications_read($1)', [firstNotice.id]);
      assert.equal((await q('select * from public.notifications where read_at is null')).length, 1);
      await user(ids.a);
      assert.equal((await q('select * from public.notifications where read_at is null')).length, 1);
    });
    await run('only a trusted service can review reports and suspend an account', async () => {
      const id = (await q('select public.report_explorer($1,$2) as id', [ids.b, 'Unwanted contact']))[0].id;
      await denied('select public.review_report($1,$2,true)', [id, 'resolved'], /permission/);
      await db.exec('set local role service_role');
      await q('select public.review_report($1,$2,true)', [id, 'resolved']);
      await user(ids.a);
      assert.equal((await q('select status from public.reports'))[0].status, 'resolved');
      assert.equal((await q('select id from public.profiles where id=$1', [ids.b])).length, 0);
      await user(ids.b);
      await denied('select public.send_letter($1,$2,$3)', [body, 'pigeon', randomUUID()]);
    });
    await run('account deletion is confirmed, scoped to the caller, and cascades private/shared data', async () => {
      const id = await send(); await arrive(id); await user(ids.b);
      await q('select public.decide_letter($1,true)', [id]);
      await user(ids.a); await q('select public.report_explorer($1,$2)', [ids.b, 'Unwanted contact']);
      await denied("select public.delete_account('delete')", [], /Type DELETE/);
      assert.equal((await q('select public.my_account() as a'))[0].a.points, 110);
      await q("select public.delete_account('DELETE')");
      assert.equal((await q('select public.my_account() as a'))[0].a, null);
      await denied('select public.send_letter($1,$2,$3)', [body, 'pigeon', randomUUID()]);
      await admin();
      for (const table of ['letters','conversations','messages','reports','notifications']) assert.equal((await q(`select * from public.${table}`)).length, 0);
      for (const table of ['birthdays']) assert.equal((await q(`select * from private.${table} where user_id=$1`, [ids.a])).length, 0);
      assert.equal((await q('select * from auth.users where id=$1', [ids.a])).length, 0);
      assert.equal((await q('select points from public.wallets where user_id=$1', [ids.b]))[0].points, 120);
    });
    await run('an account can be deleted before onboarding and while suspended', async () => {
      await admin(); const fresh = randomUUID(); await q('insert into auth.users values($1)', [fresh]);
      await user(fresh); await q("select public.delete_account('DELETE')");
      await admin(); await q('update public.profiles set active=false where id=$1', [ids.a]);
      await user(ids.a); await q("select public.delete_account('DELETE')");
      await admin();
      assert.equal((await q('select * from auth.users where id in ($1,$2)', [fresh, ids.a])).length, 0);
    });
  } finally { await db.close(); }
});
