import 'react-native-url-polyfill/auto';
import { validateBackendConfig } from './config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || '';
const mode = process.env.EXPO_PUBLIC_APP_MODE?.trim() || '';
const demoRequested = mode === 'demo';

export const backendConfigError = validateBackendConfig(url, key, mode);
export const liveMode = !demoRequested && (mode === 'live' || !!(url || key) || !!backendConfigError);
export const supabase = liveMode && !backendConfigError ? createClient(url, key, {
  auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
}) : null;

if (supabase && Platform.OS !== 'web') {
  if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
  AppState.addEventListener('change', state => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
