import type { Destination } from '../domain/model';

export type LetterDraft = { body: string; courier: 'pigeon' | 'postman'; target: Destination };
export const emptyDraft = (): LetterDraft => ({ body: '', courier: 'pigeon', target: { kind: 'anywhere' } });
export const draftKey = (owner: string) => `pigeon-post.live.draft.${owner}`;
export function parseDraft(raw: string | null): LetterDraft {
  try {
    const value = JSON.parse(raw || 'null');
    if (value?.version !== 1 || typeof value.body !== 'string' || value.body.length > 800) return emptyDraft();
    const target = value.target;
    if (!(target?.kind === 'anywhere' || (target?.kind === 'country' && typeof target.country === 'string' && target.country.length <= 60) || (target?.kind === 'person' && typeof target.personId === 'string' && target.personId.length <= 100))) return emptyDraft();
    if (value.courier !== 'pigeon' && value.courier !== 'postman') return emptyDraft();
    return { body: value.body, courier: value.courier, target };
  } catch { return emptyDraft(); }
}

// Ordering also applies across hook remounts and account changes. A delayed write
// must never resurrect a draft after sending or deleting an account.
export function createDraftStore(storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown>; removeItem(key: string): Promise<unknown> }) {
  let pending: Promise<unknown> = Promise.resolve();
  const enqueue = <T,>(work: () => Promise<T>): Promise<T> => {
    const result = pending.catch(() => {}).then(work);
    pending = result;
    return result;
  };
  return {
    load: (owner: string) => enqueue(async () => parseDraft(await storage.getItem(draftKey(owner)))),
    save: (owner: string, draft: LetterDraft) => enqueue(() => storage.setItem(draftKey(owner), JSON.stringify({ version: 1, ...draft }))),
    clear: (owner: string) => enqueue(() => storage.removeItem(draftKey(owner))),
  };
}
