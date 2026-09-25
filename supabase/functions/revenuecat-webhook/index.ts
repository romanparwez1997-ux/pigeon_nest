import { json, syncPremium } from '../_shared/billing.ts';
import { isUserId } from '../_shared/revenuecat.ts';
Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  const actual = request.headers.get('Authorization') || '';
  const expected = `Bearer ${secret}`;
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) difference |= (actual.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  if (!secret || difference !== 0) return json({ error: 'Unauthorized' }, 401);
  try {
    const { event } = await request.json();
    if (!event || typeof event.type !== 'string') return json({ error: 'Invalid event' }, 400);
    if (event.type === 'TEST') return json({ ok: true });
    const users = [...new Set([event.app_user_id, event.original_app_user_id, ...(event.aliases || []), ...(event.transferred_from || []), ...(event.transferred_to || [])].filter(isUserId))];
    // Re-fetch current authoritative state: retries and out-of-order events cannot
    // replay an old entitlement. Transfers reconcile both accounts.
    for (const user of users) await syncPremium(user);
    return json({ ok: true });
  } catch { return json({ error: 'Verification failed; retry event' }, 503); }
});
