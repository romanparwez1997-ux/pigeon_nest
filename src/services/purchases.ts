import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import { supabase } from '../backend/client';

export const billingLinks = {
  terms: process.env.EXPO_PUBLIC_TERMS_URL || '',
  privacy: process.env.EXPO_PUBLIC_PRIVACY_URL || '',
};
const apiKey = Platform.OS === 'android' ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY : process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
export function billingUnavailable(): string | null {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return 'Subscriptions are available in the Android and iPhone apps.';
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return 'Store checkout is available in the installed Pigeon Post app. This Expo Go preview cannot make purchases.';
  if (!apiKey || !apiKey.startsWith(Platform.OS === 'android' ? 'goog_' : 'appl_')) return 'Purchases are not available yet. Your free account and daily gifts are ready to use.';
  if (![billingLinks.terms, billingLinks.privacy].every(url => /^https:\/\//.test(url))) return 'Purchases are not available yet. Your free account and daily gifts are ready to use.';
  return null;
}
let queue: Promise<unknown> = Promise.resolve();
function asUser<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const result = queue.catch(() => {}).then(async () => {
    const unavailable = billingUnavailable();
    if (unavailable) throw new Error(unavailable);
    const { data } = await supabase!.auth.getSession();
    if (data.session?.user.id !== userId) throw new Error('Sign in again before purchasing.');
    if (!await Purchases.isConfigured()) Purchases.configure({ apiKey: apiKey!, appUserID: userId });
    else if (await Purchases.getAppUserID() !== userId) await Purchases.logIn(userId);
    return task();
  });
  queue = result;
  return result;
}
export const loadMonthlyPlan = (userId: string) => asUser(userId, async () => {
  const offerings = await Purchases.getOfferings();
  const plan = offerings.current?.monthly;
  if (!plan || plan.product.subscriptionPeriod !== 'P1M') throw new Error('The monthly plan is not available in your store yet.');
  return plan;
});
export async function syncPremium(failureMessage = 'Your purchase could not be verified yet. Use Restore purchases shortly; do not purchase again.') {
  if (!supabase) throw new Error('Sign in first.');
  const { data, error } = await supabase.functions.invoke('sync-premium');
  if (error || data?.error) throw new Error(failureMessage);
  return data as { active: boolean };
}
export const purchaseMonthly = (userId: string, plan: PurchasesPackage) => asUser(userId, async () => {
  // Fail before opening store checkout if server billing has not been configured.
  const current = await syncPremium('Checkout is temporarily unavailable. No payment was started.');
  if (current.active) return current;
  await Purchases.purchasePackage(plan);
  return syncPremium();
});
export const restorePremium = (userId: string) => asUser(userId, async () => { await Purchases.restorePurchases(); return syncPremium(); });
export const subscriptionManagementURL = (userId: string) => asUser(userId, async () => (await Purchases.getCustomerInfo()).managementURL);
