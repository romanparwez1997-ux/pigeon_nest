export function validateBackendConfig(url: string, key: string, mode = ''): string | null {
  if (mode && mode !== 'live' && mode !== 'demo') return 'EXPO_PUBLIC_APP_MODE must be live or demo.';
  if (!url && !key && mode !== 'live') return null;
  if (!url || !key) return 'Set both EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart Expo.';
  try {
    const parsed = new URL(url);
    const parts = parsed.hostname.split('.').map(Number);
    const ipv4 = parts.length === 4 && parts.every(p => Number.isInteger(p) && p >= 0 && p <= 255);
    const local = parsed.hostname === 'localhost' || (ipv4 && (parts[0] === 127 || parts[0] === 10 ||
      (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)));
    if (parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname) ||
      (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local))) {
      return 'Use an HTTPS Supabase project URL, or HTTP on localhost/a private LAN IP for development.';
    }
  } catch { return 'The Supabase project URL is invalid.'; }
  if (key.startsWith('sb_secret_')) return 'A secret key cannot be used in the app. Replace it with the publishable key and rotate the exposed secret.';
  if (!key.startsWith('sb_publishable_')) {
    try {
      const part = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
      if (payload.role !== 'anon') return 'Only a publishable key or legacy anon key is allowed in the app.';
    } catch { return 'Use a Supabase publishable key from the project’s API settings.'; }
  }
  return null;
}
