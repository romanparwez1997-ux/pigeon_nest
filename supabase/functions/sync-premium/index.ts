import { admin, cors, json, syncPremium } from '../_shared/billing.ts';
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Sign in first' }, 401);
  const { data, error } = await admin().auth.getUser(authorization.slice(7));
  if (error || !data.user) return json({ error: 'Sign in first' }, 401);
  try { return json(await syncPremium(data.user.id)); }
  catch { return json({ error: 'Subscription verification is unavailable. Try Restore purchases shortly.' }, 503); }
});
