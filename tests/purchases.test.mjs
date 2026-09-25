import test from 'node:test';
import assert from 'node:assert/strict';
import { premiumStatus, isUserId } from '../supabase/functions/_shared/revenuecat.ts';
const now = Date.parse('2026-09-25T00:00:00Z');
const payload = () => ({ subscriber: { entitlements: { pigeon_plus: { product_identifier: 'monthly', expires_date: '2026-10-01T00:00:00Z' } }, subscriptions: { monthly: { purchase_date: '2026-09-01T00:00:00Z', is_sandbox: false, period_type: 'normal' } } } });
test('billing verification only accepts the configured active monthly entitlement', () => {
  assert.equal(premiumStatus(payload(), ['monthly'], false, now).periodStart, '2026-09-01T00:00:00.000Z');
  assert.equal(premiumStatus(payload(), ['wrong'], false, now).expiresAt, null);
  assert.equal(premiumStatus({}, ['monthly'], false, now).expiresAt, null);
  assert.equal(premiumStatus(payload(), ['monthly'], false, now + 60*86400000).expiresAt, null);
  const p=payload(); p.subscriber.subscriptions.monthly.is_sandbox=true;
  assert.equal(premiumStatus(p,['monthly'],false,now).expiresAt,null);
  assert.ok(premiumStatus(p,['monthly'],true,now).expiresAt);
});
test('refunds revoke access; trials never mint paid-period points; grace preserves access', () => {
  const p=payload(); p.subscriber.subscriptions.monthly.refunded_at='2026-09-24';
  assert.equal(premiumStatus(p,['monthly'],false,now).expiresAt,null);
  delete p.subscriber.subscriptions.monthly.refunded_at;
  p.subscriber.subscriptions.monthly.period_type='trial';
  assert.equal(premiumStatus(p,['monthly'],false,now).periodStart,null);
  assert.ok(premiumStatus(p,['monthly'],false,now).expiresAt);
  p.subscriber.entitlements.pigeon_plus.expires_date='2026-09-24';
  p.subscriber.subscriptions.monthly.grace_period_expires_date='2026-09-27';
  assert.equal(premiumStatus(p,['monthly'],false,now).expiresAt,'2026-09-27T00:00:00.000Z');
  p.subscriber.subscriptions.monthly.purchase_date='bad date';
  assert.equal(premiumStatus(p,['monthly'],false,now).expiresAt,null);
});
test('only explicit UUID app user identities may be reconciled', () => {
  assert.equal(isUserId('10000000-0000-4000-8000-000000000001'),true);
  for (const value of ['$RCAnonymousID:test', null, {}, '']) assert.equal(isUserId(value),false);
});
