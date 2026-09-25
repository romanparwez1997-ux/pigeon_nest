// Pure parser shared with tests. Never grant from a client-supplied entitlement.
export type PremiumStatus = { expiresAt: string | null; periodStart: string | null; productId: string };
export function premiumStatus(payload: any, products: string[], allowSandbox = false, now = Date.now()): PremiumStatus {
  const empty: PremiumStatus = { expiresAt: null, periodStart: null, productId: '' };
  const subscriber = payload?.subscriber;
  const entitlement = subscriber?.entitlements?.pigeon_plus;
  const product = entitlement?.product_identifier;
  if (typeof product !== 'string' || !products.includes(product)) return empty;
  const subscription = subscriber?.subscriptions?.[product];
  if (!subscription || (subscription.is_sandbox !== false && !allowSandbox) || subscription.refunded_at) return empty;
  // Grace periods preserve access. The same purchase period cannot pay twice.
  const expiry = Math.max(Date.parse(entitlement.expires_date) || 0, Date.parse(subscription.grace_period_expires_date) || 0);
  const purchase = Date.parse(subscription.purchase_date);
  if (expiry <= now || !Number.isFinite(expiry) || !Number.isFinite(purchase) || purchase > now) return empty;
  return { expiresAt: new Date(expiry).toISOString(), periodStart: subscription.period_type === 'trial' ? null : new Date(purchase).toISOString(), productId: product };
}
export const isUserId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
