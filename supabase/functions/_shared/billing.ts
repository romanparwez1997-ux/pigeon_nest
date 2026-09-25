import { createClient } from 'npm:@supabase/supabase-js@2.117.1';
import { isUserId, premiumStatus } from './revenuecat.ts';
export const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
export const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
export async function syncPremium(userId: string) {
  if (!isUserId(userId)) throw new Error('Invalid account ID');
  const key = Deno.env.get('REVENUECAT_SECRET_KEY');
  const products = (Deno.env.get('REVENUECAT_MONTHLY_PRODUCTS') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!key || !products.length) throw new Error('Billing is not configured');
  const observedAt = new Date().toISOString();
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Billing verification unavailable (${response.status})`);
  const status = premiumStatus(await response.json(), products, Deno.env.get('ALLOW_SANDBOX_PURCHASES') === 'true');
  const db = admin();
  const { data: profile, error: profileError } = await db.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (profileError) throw new Error('Account lookup failed');
  if (!profile) return { active: false }; // Deleted / not-yet-onboarded account.
  const { error } = await db.rpc('apply_premium_status', { p_user: userId, p_expires_at: status.expiresAt, p_period_start: status.periodStart, p_product_id: status.productId, p_observed_at: observedAt });
  if (error) throw new Error('Could not save verified subscription');
  return { active: !!status.expiresAt };
}
