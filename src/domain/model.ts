export const INTERESTS = ['Travel', 'Music', 'Books', 'Art', 'Gaming', 'Photography', 'Food', 'Nature', 'Films', 'Languages', 'Space', 'Coffee'] as const;
export type Interest = typeof INTERESTS[number];
export type Courier = 'pigeon' | 'postman';
export type Destination = { kind: 'anywhere' } | { kind: 'country'; country: string } | { kind: 'person'; personId: string };
export type Profile = { name: string; birthday: string; interests: Interest[] };
export type Person = { id: string; name: string; birthday: string; country: string; city: string; initials: string; color: string; interests: Interest[]; letter: string };
export type Letter = { id: string; text: string; courier: Courier; personId: string; direction: 'incoming' | 'outgoing'; status: 'traveling' | 'arrived' | 'accepted' | 'passed' | 'expired'; sentAt: number; arrivesAt: number; expiresAt: number; visited: string[]; destination?: Destination };
export type Message = { id: string; text: string; from: 'me' | 'them'; at: number };
export type Conversation = { id: string; personId: string; messages: Message[] };
export type GameStats = { rounds: number; ticWins: number; memoryBest?: number };
export type PostState = { version: 1; profile: Profile | null; letters: Letter[]; conversations: Conversation[]; points: number; blocked: string[]; reports: { personId: string; at: number }[]; gameStats?: GameStats };
export const initialState: PostState = { version: 1, profile: null, letters: [], conversations: [], points: 120, blocked: [], reports: [] };

export function ageAt(birthday: string, now = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null;
  const [y, m, d] = birthday.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d || date > now) return null;
  return now.getFullYear() - y - (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d) ? 1 : 0);
}

// All people and letters in the prototype are fictional. Dates of birth make
// cohort checks follow birthdays, rather than storing an age that goes stale.
export const PEOPLE: Person[] = [
  { id: 'yuki', name: 'Yuki', birthday: '2003-04-18', city: 'Kyoto', country: 'Japan', initials: 'YK', color: '#DDE8DA', interests: ['Art', 'Books', 'Photography', 'Travel'], letter: 'Hello from a little bookshop in Kyoto. I collect postcards, quiet places, and stories from people I haven’t met yet. What’s one small thing that made you smile today?' },
  { id: 'luca', name: 'Luca', birthday: '2001-02-11', city: 'Florence', country: 'Italy', initials: 'LC', color: '#F1D9C4', interests: ['Food', 'Music', 'Travel', 'Coffee'], letter: 'Ciao, stranger! My perfect Sunday involves a very long walk and a very good coffee. If you could send me one song from your corner of the world, what would it be?' },
  { id: 'amara', name: 'Amara', birthday: '2004-06-23', city: 'Nairobi', country: 'Kenya', initials: 'AM', color: '#E3DDF1', interests: ['Nature', 'Photography', 'Books', 'Space'], letter: 'A little hello from Nairobi. I’m learning to photograph the stars, slowly! Tell me about a place you dream of visiting. Maybe we’ll both add it to our lists.' },
  { id: 'milo', name: 'Milo', birthday: '2002-09-08', city: 'Lisbon', country: 'Portugal', initials: 'ML', color: '#D3E7EB', interests: ['Gaming', 'Films', 'Languages', 'Art'], letter: 'Hey! I’m trying to watch a film from every country. What should I watch from yours? Bonus points if it has a beautiful soundtrack.' },
  { id: 'jun', name: 'Jun', birthday: '2009-12-11', city: 'Seoul', country: 'South Korea', initials: 'JN', color: '#DDE8DA', interests: ['Gaming', 'Art', 'Music', 'Books'], letter: 'Hi! I like drawing imaginary cities and trading music recommendations. What are you listening to this week?' },
  { id: 'ella', name: 'Ella', birthday: '2009-08-02', city: 'Helsinki', country: 'Finland', initials: 'EL', color: '#E3DDF1', interests: ['Books', 'Nature', 'Photography', 'Space'], letter: 'Hello from Finland! I’m looking for a pen pal who enjoys books and little adventures. What would your dream treehouse look like?' },
  { id: 'rio', name: 'Rio', birthday: '2009-11-04', city: 'São Paulo', country: 'Brazil', initials: 'RI', color: '#F1D9C4', interests: ['Films', 'Food', 'Travel', 'Languages'], letter: 'Oi! I’m learning about the world one conversation at a time. What’s your favourite food to make with your family?' },
  { id: 'noor', name: 'Noor', birthday: '2009-07-14', city: 'Turku', country: 'Finland', initials: 'NR', color: '#F1D9C4', interests: ['Art', 'Travel', 'Music', 'Nature'], letter: 'Hi from Finland! I fill my sketchbook with places I want to visit. Which place would you draw first?' },
  { id: 'hana', name: 'Hana', birthday: '2002-05-15', city: 'Osaka', country: 'Japan', initials: 'HN', color: '#F0D9DE', interests: ['Music', 'Food', 'Travel', 'Art'], letter: 'Hello from Osaka! I love finding tiny restaurants and sharing their stories. What is your favourite comfort food?' },
];

export const COUNTRIES = [
  { name: 'Japan', flag: '🇯🇵', hello: 'Konnichiwa', color: '#F6E0D9' },
  { name: 'Finland', flag: '🇫🇮', hello: 'Moi', color: '#DDEAF3' },
  { name: 'Brazil', flag: '🇧🇷', hello: 'Olá', color: '#E6EDC8' },
  { name: 'Italy', flag: '🇮🇹', hello: 'Ciao', color: '#F8E8C9' },
  { name: 'South Korea', flag: '🇰🇷', hello: 'Annyeong', color: '#EAE1F5' },
  { name: 'Kenya', flag: '🇰🇪', hello: 'Jambo', color: '#F2DFBD' },
  { name: 'Portugal', flag: '🇵🇹', hello: 'Olá', color: '#DAEAE1' },
];

export function destinationLabel(destination: Destination = { kind: 'anywhere' }) {
  return destination.kind === 'country' ? destination.country : destination.kind === 'person' ? PEOPLE.find(p => p.id === destination.personId)?.name || 'Selected explorer' : 'Anywhere in the world';
}

export function eligible(profile: Profile, person: Person, now = new Date()) {
  const a = ageAt(profile.birthday, now), b = ageAt(person.birthday, now);
  return a !== null && b !== null && a >= 16 && b >= 16 && (a < 18) === (b < 18);
}

export function candidates(state: PostState, now = new Date(), excluded: string[] = [], destination: Destination = { kind: 'anywhere' }) {
  if (!state.profile) return [];
  return PEOPLE.filter(p => eligible(state.profile!, p, now) && !state.blocked.includes(p.id) && !excluded.includes(p.id)
    && (destination.kind !== 'country' || p.country === destination.country)
    && (destination.kind !== 'person' || p.id === destination.personId))
    .sort((a, b) => b.interests.filter(i => state.profile!.interests.includes(i)).length - a.interests.filter(i => state.profile!.interests.includes(i)).length);
}

export function setup(profile: Profile, now = Date.now()): PostState {
  const age = ageAt(profile.birthday, new Date(now));
  if (age === null || age < 16 || age > 120) throw new Error('Pigeon Post is for people aged 16 and above. Please enter a valid date of birth.');
  if (!profile.name.trim() || profile.name.trim().length > 30) throw new Error('Please enter a name between 1 and 30 characters.');
  if (profile.interests.length < 3) throw new Error('Pick at least three interests to find your kind of people.');
  const state = { ...initialState, profile: { ...profile, name: profile.name.trim() } };
  state.letters = candidates(state, new Date(now)).slice(0, 3).map((p, i) => ({ id: `welcome-${p.id}`, text: p.letter, courier: i === 1 ? 'postman' : 'pigeon', personId: p.id, direction: 'incoming', status: 'arrived', sentAt: now, arrivesAt: now, expiresAt: now + 86400000, visited: [p.id] }));
  return state;
}

export function sendLetter(state: PostState, text: string, courier: Courier, now = Date.now(), destination: Destination = { kind: 'anywhere' }): PostState {
  state = advance(state, now);
  if (!state.profile) throw new Error('Create your explorer profile first.');
  if (text.trim().length < 20 || text.trim().length > 800) throw new Error('Your letter should be between 20 and 800 characters.');
  if (state.points < 10) throw new Error('You need 10 postage points to send a letter.');
  const active = state.letters.filter(l => l.direction === 'outgoing' && ['traveling', 'arrived'].includes(l.status));
  if (active.length >= 5) throw new Error('Five letters are already on a journey. Let one arrive before sending another.');
  const person = candidates(state, new Date(now), active.map(l => l.personId), destination)[0];
  if (!person) throw new Error(destination.kind === 'person' ? 'This explorer is unavailable or already has a letter on its way. Choose another destination.' : 'No available explorer in this destination and your friendship circle. Try another country or Anywhere.');
  const letter: Letter = { id: `letter-${now}-${Math.random().toString(36).slice(2, 8)}`, text: text.trim(), courier, personId: person.id, direction: 'outgoing', status: 'traveling', sentAt: now, arrivesAt: now + (courier === 'pigeon' ? 30000 : 60000), expiresAt: now + 86400000, visited: [person.id], destination };
  return { ...state, points: state.points - 10, letters: [letter, ...state.letters] };
}

export function advance(state: PostState, now = Date.now()): PostState {
  let changed = false;
  const letters = state.letters.map(l => {
    if (!['traveling', 'arrived'].includes(l.status)) return l;
    const person = PEOPLE.find(p => p.id === l.personId);
    if (!state.profile || !person || !eligible(state.profile, person, new Date(now)) || state.blocked.includes(l.personId) || now >= l.expiresAt) {
      changed = true; return { ...l, status: 'expired' as const };
    }
    if (l.status === 'traveling' && now >= l.arrivesAt) { changed = true; return { ...l, status: 'arrived' as const }; }
    if (l.status === 'arrived' && l.direction === 'outgoing' && now >= l.arrivesAt + 120000) {
      const next = l.visited.length < 3 && l.destination?.kind !== 'person' ? candidates(state, new Date(now), l.visited, l.destination)[0] : null;
      changed = true;
      return next ? { ...l, personId: next.id, visited: [...l.visited, next.id], status: 'traveling' as const, arrivesAt: now + 30000 } : { ...l, status: 'expired' as const };
    }
    return l;
  });
  // If a member turns 18, previous teen conversations are no longer accessible.
  const conversations = state.conversations.filter(c => {
    const p = PEOPLE.find(p => p.id === c.personId);
    return state.profile && p && eligible(state.profile, p, new Date(now)) && !state.blocked.includes(p.id);
  });
  return changed || conversations.length !== state.conversations.length ? { ...state, letters, conversations } : state;
}

export function acceptLetter(state: PostState, id: string, now = Date.now()): PostState {
  state = advance(state, now);
  const letter = state.letters.find(l => l.id === id);
  if (!letter || letter.status !== 'arrived') throw new Error('This letter is no longer available to accept.');
  const exists = state.conversations.some(c => c.personId === letter.personId);
  const conversation: Conversation = { id: `chat-${letter.personId}`, personId: letter.personId, messages: [{ id: `first-${id}`, text: letter.text, from: letter.direction === 'incoming' ? 'them' : 'me', at: now }] };
  return { ...state, letters: state.letters.map(l => l.id === id ? { ...l, status: 'accepted' } : l), conversations: exists ? state.conversations : [conversation, ...state.conversations] };
}

export function passLetter(state: PostState, id: string, now = Date.now()): PostState {
  state = advance(state, now);
  const letter = state.letters.find(l => l.id === id);
  if (!letter || letter.status !== 'arrived') return state;
  // Incoming letters leave this user's inbox. Outgoing demo letters move on.
  const next = letter.direction === 'outgoing' && letter.visited.length < 3 && letter.destination?.kind !== 'person' ? candidates(state, new Date(now), letter.visited, letter.destination)[0] : null;
  return { ...state, letters: state.letters.map(l => l.id !== id ? l : next ? { ...l, personId: next.id, visited: [...l.visited, next.id], status: 'traveling', arrivesAt: now + 30000 } : { ...l, status: l.direction === 'incoming' ? 'passed' : 'expired' }) };
}

export function sendMessage(state: PostState, conversationId: string, text: string, now = Date.now()): PostState {
  state = advance(state, now);
  if (!text.trim()) return state;
  if (text.trim().length > 2000) throw new Error('Messages can be up to 2,000 characters.');
  if (!state.conversations.some(c => c.id === conversationId)) throw new Error('This conversation is no longer available.');
  return { ...state, conversations: state.conversations.map(c => c.id === conversationId ? { ...c, messages: [...c.messages, { id: `message-${now}-${Math.random()}`, text: text.trim(), from: 'me', at: now }] } : c) };
}

export function blockPerson(state: PostState, personId: string, report = false, now = Date.now()): PostState {
  return advance({ ...state, blocked: [...new Set([...state.blocked, personId])], reports: report ? [...state.reports, { personId, at: now }] : state.reports }, now);
}
