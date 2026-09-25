// Read-only application checks. Auth creates a short-lived login session;
// no profiles, mail, messages, blocks, or reports are created or changed.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { readBackendConfig } from './backend-config.mjs';

async function main() {
  const { url, key } = await readBackendConfig();
  if (!url || !key) throw new Error('Set the public Supabase connection in .env.local first.');
  const email = process.env.BACKEND_TEST_EMAIL;
  const password = process.env.BACKEND_TEST_PASSWORD;
  if (!email || !password) throw new Error('Set BACKEND_TEST_EMAIL and BACKEND_TEST_PASSWORD for a confirmed test account; see TESTING.md.');
  const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
  const anonymous = createClient(url, key, { auth });
  const user = createClient(url, key, { auth });
  try {
    const status = await anonymous.rpc('backend_status');
    assert.equal(status.error, null, 'Public status RPC should succeed.');
    assert.equal(status.data.schema_version, 2, 'Apply all migrations before testing.');
    const forbidden = await anonymous.rpc('discover');
    assert.ok(forbidden.error, 'Anonymous discovery must be denied.');
    const login = await user.auth.signInWithPassword({ email, password });
    assert.equal(login.error, null, 'Sign in failed. Confirm the test email and check its password.');
    const id = login.data.user.id;
    const account = await user.rpc('my_account');
    assert.equal(account.error, null, 'Account RPC should succeed.');
    assert.ok(account.data?.profile, 'Create a passport for the test account in the app first.');
    assert.equal(account.data.profile.id, id);
    const [wallets, discovery, notifications, rooms] = await Promise.all([
      user.from('wallets').select('*'), user.rpc('discover'),
      user.from('notifications').select('*').limit(100), user.from('conversations').select('*').limit(100),
    ]);
    for (const result of [wallets, discovery, notifications, rooms]) assert.equal(result.error, null, 'Authenticated reads should succeed.');
    assert.equal(wallets.data.length, 1);
    assert.equal(wallets.data[0].user_id, id);
    assert.ok(discovery.data.every(p => p.id !== id && !Object.hasOwn(p, 'birthday')));
    assert.ok(notifications.data.every(n => n.user_id === id));
    for (const room of rooms.data) {
      assert.ok(room.member_a === id || room.member_b === id);
      const messages = await user.rpc('message_history', { p_conversation: room.id, p_limit: 2 });
      assert.equal(messages.error, null, 'Chat history RPC should succeed.');
      assert.ok(messages.data.every(m => m.conversation_id === room.id));
    }
    console.log('PASS: schema v2, email/password Auth, account RPC, own wallet, private discovery, notifications, and accessible chat history.');
    console.log('Next: run the two-device delivery, Realtime, recovery, and deletion checks in TESTING.md.');
  } finally {
    await user.auth.signOut({ scope: 'local' });
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
