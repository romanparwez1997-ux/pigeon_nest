import test from 'node:test';
import assert from 'node:assert/strict';
import { ageAt, setup, eligible, PEOPLE, candidates, sendLetter, advance, acceptLetter, passLetter, sendMessage, blockPerson } from '../src/domain/model.ts';

const now = new Date(2026, 8, 24, 12).getTime();
const adult = { name: 'Alex', birthday: '2000-06-20', interests: ['Books', 'Art', 'Travel'] };
const teen = { ...adult, birthday: '2009-03-12' };

test('validates exact birthdays, minimum age, and impossible dates', () => {
  assert.equal(ageAt('2010-09-24', new Date(now)), 16);
  assert.equal(ageAt('2010-09-25', new Date(now)), 15);
  assert.equal(ageAt('2010-02-30', new Date(now)), null);
  assert.equal(ageAt('2028-01-01', new Date(now)), null);
  assert.equal(ageAt('wrong', new Date(now)), null);
  assert.throws(() => setup({ ...adult, birthday: '2010-09-25' }, now), /16/);
});

test('teen and adult inboxes and matching never cross age groups', () => {
  for (const profile of [adult, teen]) {
    const s = setup(profile, now);
    assert.equal(s.letters.length, 3);
    for (const l of s.letters) assert.ok(eligible(profile, PEOPLE.find(p => p.id === l.personId), new Date(now)));
    for (const p of candidates(s, new Date(now))) assert.equal(ageAt(profile.birthday, new Date(now)) < 18, ageAt(p.birthday, new Date(now)) < 18);
  }
});

test('sending charges once, preserves text, and follows the selected courier delay', () => {
  const s = setup(adult, now);
  for (const courier of ['pigeon', 'postman']) {
    const next = sendLetter(s, 'A curious little hello from the other side of the world.', courier, now);
    assert.equal(next.points, 110);
    assert.equal(s.points, 120);
    assert.equal(next.letters[0].arrivesAt - now, courier === 'pigeon' ? 30000 : 60000);
    assert.equal(advance(next, now + 29000).letters[0].status, 'traveling');
    assert.equal(advance(next, next.letters[0].arrivesAt).letters[0].status, 'arrived');
  }
  assert.throws(() => sendLetter(s, 'tiny', 'pigeon', now), /20/);
  assert.throws(() => sendLetter({ ...s, points: 0 }, 'A long enough letter to be sent.', 'pigeon', now), /points/);
});

test('accepting requires arrival and creates only one conversation', () => {
  const s = sendLetter(setup(adult, now), 'Tell me about a favourite place of yours.', 'pigeon', now);
  const l = s.letters[0];
  assert.throws(() => acceptLetter(s, l.id, now), /no longer/);
  const next = acceptLetter(s, l.id, now + 30000);
  assert.equal(next.conversations.length, 1);
  assert.equal(next.conversations[0].messages[0].from, 'me');
  assert.throws(() => acceptLetter(next, l.id, now + 30001), /no longer/);
  const incoming = next.letters.find(x => x.direction === 'incoming' && x.personId === l.personId);
  assert.equal(acceptLetter(next, incoming.id, now + 30002).conversations.length, 1);
});

test('passing reroutes to another eligible person without an additional charge', () => {
  let s = sendLetter(setup(teen, now), 'What are you reading this week, future friend?', 'pigeon', now);
  const first = s.letters[0];
  s = passLetter(s, first.id, now + 30000);
  const rerouted = s.letters[0];
  assert.notEqual(rerouted.personId, first.personId);
  assert.equal(rerouted.visited.length, 2);
  assert.equal(rerouted.status, 'traveling');
  assert.equal(s.points, 110);
  assert.ok(eligible(teen, PEOPLE.find(p => p.id === rerouted.personId), new Date(now)));
  s = passLetter(s, first.id, now + 60000);
  s = passLetter(s, first.id, now + 90000);
  assert.equal(s.letters[0].status, 'expired');
});

test('unanswered outgoing letters reroute, and expired letters cannot be accepted', () => {
  let s = sendLetter(setup(adult, now), 'Where would your dream adventure take you?', 'pigeon', now);
  s = advance(s, now + 30000);
  s = advance(s, now + 150000);
  assert.equal(s.letters[0].visited.length, 2);
  assert.equal(s.letters[0].status, 'traveling');
  s = advance(s, now + 86400000);
  assert.equal(s.letters[0].status, 'expired');
  assert.throws(() => acceptLetter(s, s.letters[0].id, now + 86400000), /no longer/);
});

test('blocking stops matching, letter acceptance, and messaging', () => {
  let s = setup(adult, now);
  const l = s.letters[0];
  s = acceptLetter(s, l.id, now);
  const chat = s.conversations[0];
  s = sendMessage(s, chat.id, 'Lovely to meet you!', now);
  assert.equal(s.conversations[0].messages.length, 2);
  s = blockPerson(s, l.personId, true, now);
  assert.equal(s.conversations.length, 0);
  assert.equal(s.reports.length, 1);
  assert.ok(!candidates(s, new Date(now)).some(p => p.id === l.personId));
  assert.throws(() => sendMessage(s, chat.id, 'Hello again', now), /no longer/);
});

test('turning 18 closes former teen connections', () => {
  const profile = { ...teen, birthday: '2008-09-25' };
  let s = setup(profile, now);
  s = acceptLetter(s, s.letters[0].id, now);
  assert.equal(s.conversations.length, 1);
  s = advance(s, new Date(2026, 8, 25, 12).getTime());
  assert.equal(s.conversations.length, 0);
});
