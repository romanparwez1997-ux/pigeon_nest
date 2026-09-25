import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDraftStore, emptyDraft, type LetterDraft } from './letterDraft';

export const letterDraftStore = createDraftStore(AsyncStorage);
export function useLetterDraft(owner: string | null) {
  const [loaded, setLoaded] = useState<{ owner: string; draft: LetterDraft } | null>(null);
  const [error, setError] = useState('');
  const latest = useRef(loaded); latest.current = loaded;
  useEffect(() => {
    let alive = true;
    setLoaded(null); setError('');
    if (owner) letterDraftStore.load(owner).then(draft => {
      if (alive) setLoaded({ owner, draft });
    }).catch(() => {
      if (alive) { setLoaded({ owner, draft: emptyDraft() }); setError('Your saved draft could not be loaded on this device.'); }
    });
    return () => { alive = false; };
  }, [owner]);
  const ready = !!owner && loaded?.owner === owner;
  function update(patch: Partial<LetterDraft>) {
    if (!owner || latest.current?.owner !== owner) return;
    const next = { owner, draft: { ...latest.current.draft, ...patch } };
    latest.current = next; setLoaded(next);
    // Queue immediately, including the last keystroke before backgrounding.
    void letterDraftStore.save(owner, next.draft).then(() => { if (latest.current === next) setError(''); }).catch(() => { if (latest.current === next) setError('Your draft could not be saved on this device. Keep the app open until you send it.'); });
  }
  return { draft: ready ? loaded.draft : emptyDraft(), ready, error, update };
}
