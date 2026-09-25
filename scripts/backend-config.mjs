import { readFile } from 'node:fs/promises';
import { validateBackendConfig } from '../src/backend/config.ts';

export async function readBackendConfig() {
  const keys = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_APP_MODE'];
  const config = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const filename of ['.env.local', '.env']) {
    let text;
    try { text = await readFile(new URL(`../${filename}`, import.meta.url), 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*(EXPO_PUBLIC_[A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (match && keys.includes(match[1]) && config[match[1]] === undefined) {
        const raw = match[2];
        config[match[1]] = /^(['"]).*\1$/.test(raw) ? raw.slice(1, -1) : raw.replace(/\s+#.*$/, '').trim();
      }
    }
  }
  const url = config.EXPO_PUBLIC_SUPABASE_URL?.trim() || '';
  const key = config.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || '';
  const mode = config.EXPO_PUBLIC_APP_MODE?.trim() || '';
  const error = validateBackendConfig(url, key, mode);
  if (error) throw new Error(error);
  return { url, key, mode };
}
