import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, sendLetter, passLetter, advance, blockPerson, candidates } from '../src/domain/model.ts';
import { botMove, winner, shuffledStamps } from '../src/domain/games.ts';
import { splitTranslationText, translateText } from '../src/services/translation.ts';

const now = new Date(2026, 8, 24, 12).getTime();
const profile = { name: 'Demo', birthday: '2009-03-12', interests: ['Books', 'Art', 'Travel'] };
const text = 'What is a little tradition from your corner of the world?';

test('country delivery and rerouting stay within the chosen country', () => {
  let s = sendLetter(setup(profile, now), text, 'pigeon', now, { kind: 'country', country: 'Finland' });
  const l = s.letters[0];
  assert.ok(['ella', 'noor'].includes(l.personId));
  s = passLetter(s, l.id, now + 30000);
  assert.notEqual(s.letters[0].personId, l.personId);
  assert.ok(['ella', 'noor'].includes(s.letters[0].personId));
  s = passLetter(s, l.id, now + 60000);
  assert.equal(s.letters[0].status, 'expired');
  assert.equal(s.points, 110);
});

test('direct letters end when declined or unanswered; never reroute', () => {
  const s = sendLetter(setup(profile, now), text, 'postman', now, { kind: 'person', personId: 'jun' });
  const l = s.letters[0];
  const passed = passLetter(s, l.id, now + 60000).letters[0];
  assert.equal(passed.status, 'expired');
  assert.deepEqual(passed.visited, ['jun']);
  const timedOut = advance(advance(s, now + 60000), now + 180000).letters[0];
  assert.equal(timedOut.status, 'expired');
  assert.equal(timedOut.personId, 'jun');
});

test('targeting cannot bypass age groups, blocks, or empty destinations', () => {
  const s = setup(profile, now);
  for (const target of [{ kind: 'person', personId: 'yuki' }, { kind: 'country', country: 'Japan' }, { kind: 'person', personId: 'missing' }]) {
    assert.throws(() => sendLetter(s, text, 'pigeon', now, target), /unavailable|No available/);
    assert.equal(s.points, 120);
  }
  const blocked = blockPerson(s, 'jun', false, now);
  assert.throws(() => sendLetter(blocked, text, 'pigeon', now, { kind: 'person', personId: 'jun' }), /unavailable/);
  assert.ok(!candidates(blocked, new Date(now)).some(p => p.id === 'jun'));
});

test('game outcomes handle wins and draws; courier blocks and stops at the end', () => {
  assert.equal(winner(['X', 'X', 'X', null, 'O', null, null, null, null]), 'X');
  assert.equal(botMove(['X', 'X', null, null, 'O', null, null, null, null]), 2);
  assert.equal(botMove(['X', 'X', null, 'O', 'O', null, null, null, null]), 5);
  const draw = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'];
  assert.equal(winner(draw), 'draw');
  assert.equal(botMove(draw), null);
  const deck = shuffledStamps(() => .41);
  assert.equal(deck.length, 12);
  for (const stamp of new Set(deck)) assert.equal(deck.filter(c => c === stamp).length, 2);
});

test('translation chunks preserve multibyte text and obey the service byte limit', () => {
  const text = 'Hello नमस्ते こんにちは 🌍 '.repeat(100);
  const chunks = splitTranslationText(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every(c => Buffer.byteLength(c, 'utf8') <= 480));
  const longWord = '🌍'.repeat(600);
  assert.equal(splitTranslationText(longWord).join(''), longWord);
  assert.ok(splitTranslationText(longWord).every(c => Buffer.byteLength(c, 'utf8') <= 480));
});

test('translation uses a read request, decodes returned text, and caches by language', async () => {
  const urls = [];
  const mock = async url => { urls.push(url); return { ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'Bonjour &amp; bienvenue !' } }) }; };
  const input = 'Hello & welcome, new friend.';
  assert.equal(await translateText(input, 'en', 'fr', undefined, mock), 'Bonjour & bienvenue !');
  assert.equal(await translateText(input, 'en', 'fr', undefined, mock), 'Bonjour & bienvenue !');
  assert.equal(urls.length, 1);
  const url = new URL(urls[0]);
  assert.equal(url.pathname, '/get');
  assert.equal(url.searchParams.get('q'), input);
  assert.equal(url.searchParams.get('langpair'), 'en|fr');
  await translateText(input, 'en', 'hi', undefined, mock);
  assert.equal(urls.length, 2);
});

test('translation handles quota, invalid results, and cancellation without fake output', async () => {
  const mock = data => async () => ({ ok: true, json: async () => data });
  await assert.rejects(() => translateText('Quota test', 'en', 'fr', undefined, mock({ responseStatus: 429 })), /daily limit/);
  await assert.rejects(() => translateText('Invalid test', 'en', 'fr', undefined, mock({ responseStatus: 403, responseData: { translatedText: 'Error text' } })), /couldn’t translate/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => translateText('Cancellation test', 'en', 'fr', controller.signal, mock({})), /cancelled/);
});
