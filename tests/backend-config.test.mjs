import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBackendConfig } from '../src/backend/config.ts';

test('live mode requires configuration; unconfigured preview and explicit demo work', () => {
  assert.equal(validateBackendConfig('', '', ''), null);
  assert.equal(validateBackendConfig('', '', 'demo'), null);
  assert.match(validateBackendConfig('', '', 'live'), /Set both/);
  assert.match(validateBackendConfig('', '', 'typo'), /must be/);
});
test('shared configuration permits local phones and rejects credentials or public HTTP', () => {
  const key = 'sb_publishable_test';
  for (const host of ['localhost', '127.0.0.1', '10.0.2.2', '192.168.1.2', '172.16.4.5']) {
    assert.equal(validateBackendConfig(`http://${host}:54321`, key, 'live'), null);
  }
  for (const url of ['http://example.com', 'http://172.32.1.1', 'https://user:pass@example.com', 'https://example.com?secret=x', 'https://example.com/rest/v1']) {
    assert.notEqual(validateBackendConfig(url, key, 'live'), null);
  }
  assert.match(validateBackendConfig('https://test.supabase.co', 'sb_secret_test'), /secret key/);
  const jwt = role => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  assert.equal(validateBackendConfig('https://test.supabase.co', jwt('anon')), null);
  assert.match(validateBackendConfig('https://test.supabase.co', jwt('service_role')), /Only a publishable/);
});
