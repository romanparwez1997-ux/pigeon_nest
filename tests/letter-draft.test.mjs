import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftStore, emptyDraft, parseDraft } from '../src/backend/letterDraft.ts';

const draft = { body: 'A letter I have not sent yet.', courier: 'postman', target: { kind: 'country', country: 'India' } };
test('drafts validate persisted data and restore delivery choices', () => {
  assert.deepEqual(parseDraft(JSON.stringify({ version: 1, ...draft })), draft);
  for (const raw of [null, '{', '{}', JSON.stringify({ version: 1, ...draft, body: 'x'.repeat(801) }), JSON.stringify({ version: 1, ...draft, target: { kind: 'person' } }), JSON.stringify({ version: 1, ...draft, courier: 'unknown' })]) assert.deepEqual(parseDraft(raw), emptyDraft());
});
test('slow writes cannot resurrect a sent or deleted draft; accounts stay separate', async () => {
  const values = new Map();
  const store = createDraftStore({
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { await new Promise(r => setTimeout(r, 5)); values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  });
  const save = store.save('alice', draft);
  const other = store.save('bob', { ...draft, body: 'Bob’s draft' });
  const clear = store.clear('alice');
  assert.deepEqual(await store.load('alice'), emptyDraft());
  assert.equal((await store.load('bob')).body, 'Bob’s draft');
  await Promise.all([save, other, clear]);
});
test('a storage failure does not block later saves or loads', async () => {
  let raw = null;
  let fail = true;
  const store = createDraftStore({ getItem: async () => raw, setItem: async (_key, value) => { if (fail) { fail = false; throw Error('disk full'); } raw = value; }, removeItem: async () => { raw = null; } });
  await assert.rejects(store.save('alice', draft), /disk full/);
  await store.save('alice', { ...draft, body: 'Recovered' });
  assert.equal((await store.load('alice')).body, 'Recovered');
});
