import { readBackendConfig } from './backend-config.mjs';

const localOnly = process.argv.includes('--config-only');
const fail = message => { console.error(message); process.exitCode = 1; };
async function main() {
  const { url, key, mode } = await readBackendConfig();
  if (!url && !key) {
    if (localOnly) { console.log('Backend not configured: building the separate demo mode.'); return; }
    fail('Backend not connected. Copy .env.example to .env.local and add your Supabase project URL and publishable key.'); return;
  }
  if (localOnly) { console.log(`Backend client configuration is valid. Mode: ${mode === 'demo' ? 'demo' : 'live'}.`); return; }
  let response;
  try {
    response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/backend_status`, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000),
    });
  } catch { fail('Unable to reach the backend. Check the URL, connection, and project status.'); return; }
  if (!response.ok) { fail(`Backend probe failed (HTTP ${response.status}). Check the public key and apply all migrations.`); return; }
  const data = await response.json();
  if (data.app !== 'pigeon-post' || data.schema_version !== 2) { fail('The connected project needs all Pigeon Post migrations, including account tools (schema version 2).'); return; }
  console.log('Connected: Pigeon Post schema version 2 is installed.');
  console.log('Next: verify email confirmation/recovery templates, delivery cron, and the two-device flow in TESTING.md.');
}
main().catch(e => fail(e.message));
