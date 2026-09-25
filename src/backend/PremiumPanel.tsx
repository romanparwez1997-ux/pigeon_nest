import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { Icon } from '../components/Artwork';
import { C } from '../theme';
import { billingLinks, billingUnavailable, loadMonthlyPlan, purchaseMonthly, restorePremium, subscriptionManagementURL } from '../services/purchases';
import type { Account } from './api';
import { Action, ui } from './ui';

export function PremiumPanel({ account, onRefresh }: { account: Account; onRefresh: () => Promise<void> }) {
  const [plan, setPlan] = useState<PurchasesPackage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const working = useRef(false);
  const unavailable = billingUnavailable();
  const userId = account.profile.id;
  useEffect(() => {
    if (unavailable) return;
    let alive = true;
    loadMonthlyPlan(userId).then(p => { if (alive) setPlan(p); }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [userId, unavailable]);
  async function run(work: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); setMessage('');
    try { await work(); await onRefresh(); }
    catch (e) { if (!(e as { userCancelled?: boolean })?.userCancelled) setError(e instanceof Error ? e.message : 'Purchase failed. Please try again.'); }
    finally { working.current = false; setBusy(false); }
  }
  return <View style={{ gap: 20 }}>
    <Icon name="spark" size={33} color={C.rust} /><Text style={ui.title}>A little more possibility.</Text><Text style={ui.body}>Pigeon Plus · a monthly subscription for frequent letter writers.</Text>
    <View style={ui.card}>{[['100 postage points', 'Added once per paid monthly period. Unused points stay in your pouch.'], ['10 letters on a journey', 'Twice the free account’s five active letters.'], ['20 letters a day', 'Up from ten, with the same thoughtful delivery pace.']].map(([title, body]) => <View key={title} style={{ gap: 5, paddingVertical: 7 }}><Text style={[ui.label, { fontSize: 15 }]}>{title}</Text><Text style={ui.body}>{body}</Text></View>)}</View>
    <Text style={ui.small}>Daily gifts, riddles, translation, and conversations stay free. Plus keeps the same friendship circles and privacy controls.</Text>
    {account.premium ? <><Text style={ui.notice}>Pigeon Plus is active{account.premium_expires_at ? ` through ${new Date(account.premium_expires_at).toLocaleDateString()}` : ''}.</Text><Action title="Manage subscription" secondary disabled={busy || !!unavailable} onPress={() => run(async () => { const url = await subscriptionManagementURL(userId); if (!url) throw new Error('Manage this subscription in the store account used to purchase it.'); await Linking.openURL(url); })} /></> : <><Text style={[ui.title, { fontSize: 27 }]}>{plan ? `${plan.product.priceString} / month` : 'Pigeon Plus'}</Text><Action title={busy ? 'Please wait…' : plan ? `Subscribe · ${plan.product.priceString} / month` : 'Purchases coming soon'} disabled={busy || !!unavailable || !plan} onPress={() => run(async () => { const result = await purchaseMonthly(userId, plan!); setMessage(result.active ? 'Welcome to Pigeon Plus. Your benefits are ready.' : 'Your purchase is pending verification. Try Restore purchases shortly.'); })} /></>}
    <Action title={busy ? 'Please wait…' : 'Restore purchases'} secondary disabled={busy || !!unavailable} onPress={() => run(async () => { const result = await restorePremium(userId); setMessage(result.active ? 'Pigeon Plus restored.' : 'No active Pigeon Plus subscription was found for this account.'); })} />
    {!!unavailable && <Text style={ui.small}>{unavailable}</Text>}
    <Text style={ui.small}>Payment is charged by your app store. The subscription renews monthly until cancelled in your store settings. Your store shows the final price and renewal terms before you confirm.</Text>
    <View style={{ flexDirection: 'row', gap: 22 }}>{[['Terms', billingLinks.terms], ['Privacy', billingLinks.privacy]].filter(([, url]) => /^https:\/\//.test(url)).map(([label, url]) => <Pressable accessibilityRole="link" key={label} onPress={() => Linking.openURL(url).catch(() => setError('Could not open this page.'))} style={{ paddingVertical: 12 }}><Text style={[ui.label, { color: C.green }]}>{label}</Text></Pressable>)}</View>
    {!!message && <Text accessibilityRole="alert" style={ui.notice}>{message}</Text>}{!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
  </View>;
}
