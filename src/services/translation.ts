export const LANGUAGES = [
  { code: 'en', label: 'English' }, { code: 'hi', label: 'हिन्दी' },
  { code: 'es', label: 'Español' }, { code: 'fr', label: 'Français' },
  { code: 'ja', label: '日本語' }, { code: 'pt', label: 'Português' },
  { code: 'ko', label: '한국어' }, { code: 'fi', label: 'Suomi' },
] as const;
export type Language = typeof LANGUAGES[number]['code'];

// MyMemory's get endpoint accepts 500 UTF-8 bytes per segment, not characters.
export function splitTranslationText(text: string, limit = 480): string[] {
  const chunks: string[] = [];
  let chunk = '', bytes = 0;
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    const size = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + size > limit) {
      const breakAt = Math.max(chunk.lastIndexOf(' '), chunk.lastIndexOf('\n'));
      if (breakAt > chunk.length / 2) {
        const head = chunk.slice(0, breakAt + 1);
        chunks.push(head);
        chunk = chunk.slice(breakAt + 1);
        bytes = [...chunk].reduce((n, c) => { const p = c.codePointAt(0)!; return n + (p < 0x80 ? 1 : p < 0x800 ? 2 : p < 0x10000 ? 3 : 4); }, 0);
      } else { chunks.push(chunk); chunk = ''; bytes = 0; }
    }
    chunk += char; bytes += size;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

export function decodeTranslation(text: string) {
  const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity: string) => {
    if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? match;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

const cache = new Map<string, string>();
export async function translateText(text: string, from: Language, to: Language, signal?: AbortSignal, request: typeof fetch = fetch): Promise<string> {
  const input = text.trim();
  if (!input) throw new Error('Add a little text to translate.');
  if (input.length > 2000) throw new Error('Translate up to 2,000 characters at a time.');
  if (from === to) return input;
  if (!LANGUAGES.some(l => l.code === from) || !LANGUAGES.some(l => l.code === to)) throw new Error('Choose a supported language.');
  const key = JSON.stringify([input, from, to]);
  if (cache.has(key)) return cache.get(key)!;
  const results: string[] = [];
  for (const chunk of splitTranslationText(input)) {
    if (signal?.aborted) throw new Error('Translation was cancelled.');
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${from}%7C${to}`;
    const response = await request(url, { signal });
    if (!response.ok) throw new Error('Translation is unavailable right now. Please try again shortly.');
    const data = await response.json();
    if (Number(data.responseStatus) === 429 || data.quotaFinished) throw new Error('The translation service’s daily limit has been reached. Try again later.');
    if (Number(data.responseStatus) !== 200 || typeof data.responseData?.translatedText !== 'string' || !data.responseData.translatedText.trim()) throw new Error('The service couldn’t translate this text. Check the original language and try again.');
    results.push(decodeTranslation(data.responseData.translatedText).trim());
  }
  const output = results.join(' ');
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, output);
  return output;
}
