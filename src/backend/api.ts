import { supabase } from './client';
import type { Destination, Interest, Person, PostState } from '../domain/model';

export type LiveProfile = { id: string; name: string; country: string; interests: Interest[]; languages: string[]; bio: string; active: boolean; created_at: string };
export type DailyReward = { reward_day: string; kind: 'pigeon' | 'postman' | 'points' | 'riddle'; amount: number };
export type RiddleRound = { id: string; question: string; attempts: number; solved: boolean; expires_at: string };
export type Account = { profile: LiveProfile; birthday: string; points: number; premium: boolean; premium_expires_at: string | null; rewards: { pigeon: number; postman: number; riddle: number; today: DailyReward | null; next_claim_at: string; round: RiddleRound | null } };
export type LiveLetter = { id: string; sender_id: string; recipient_id: string; body: string; courier: 'pigeon' | 'postman'; target_kind: 'anywhere' | 'country' | 'person'; target_country: string | null; target_person_id: string | null; status: 'traveling' | 'arrived' | 'accepted' | 'expired'; attempt_count: number; sent_at: string; arrives_at: string; respond_by: string | null; expires_at: string; client_id: string };
export type LiveConversation = { id: string; member_a: string; member_b: string; created_at: string };
export type LiveMessage = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };
export type LiveSnapshot = { account: Account | null; people: LiveProfile[]; letters: LiveLetter[]; conversations: LiveConversation[] };
const client = () => { if (!supabase) throw new Error('The backend is not configured.'); return supabase; };

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function loadSnapshot(): Promise<LiveSnapshot> {
  const results = await Promise.allSettled([
    rpc<Account | null>('my_account'),
    rpc<LiveProfile[]>('discover', { p_limit: 100 }),
    client().from('letters').select('*').order('sent_at', { ascending: false }).limit(100).then(({ data, error }) => { if (error) throw new Error(error.message); return data as LiveLetter[]; }),
    client().from('conversations').select('*').order('created_at', { ascending: false }).limit(100).then(({ data, error }) => { if (error) throw new Error(error.message); return data as LiveConversation[]; }),
  ]);
  const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failure) throw failure.reason;
  const values = results.map(r => (r as PromiseFulfilledResult<unknown>).value);
  return { account: values[0] as Account | null, people: values[1] as LiveProfile[], letters: values[2] as LiveLetter[], conversations: values[3] as LiveConversation[] };
}

export function createProfile(name: string, birthday: string, country: string, interests: Interest[]) {
  return rpc<string>('create_profile', { p_name: name, p_birthday: birthday, p_country: country, p_interests: interests, p_languages: ['en'] });
}
export function postLetter(body: string, courier: string, destination: Destination, clientId: string) {
  return rpc<string>('send_letter', { p_body: body, p_courier: courier, p_client_id: clientId, p_target_kind: destination.kind, p_target_country: destination.kind === 'country' ? destination.country : null, p_target_person: destination.kind === 'person' ? destination.personId : null });
}
export const decide = (id: string, accept: boolean) => rpc<string | null>('decide_letter', { p_letter: id, p_accept: accept });
export const postMessage = (room: string, body: string, clientId: string) => rpc<string>('send_message', { p_conversation: room, p_body: body, p_client_id: clientId });
export const block = (id: string, reason: string | null) => rpc<void>('block_explorer', { p_user: id, p_reason: reason });
export const report = (id: string, reason: string) => rpc<string>('report_explorer', { p_user: id, p_reason: reason });
export const unblock = (id: string) => rpc<void>('unblock_explorer', { p_user: id });
export const deleteAccount = (confirmation: string) => rpc<void>('delete_account', { p_confirmation: confirmation });
export const updateProfile = (profile: Pick<LiveProfile, 'name' | 'country' | 'interests' | 'languages' | 'bio'>) => rpc<void>('update_profile', {
  p_name: profile.name, p_country: profile.country, p_interests: profile.interests, p_languages: profile.languages, p_bio: profile.bio,
});
export type LiveNotification = { id: number; kind: 'letter_arrived' | 'letter_accepted'; letter_id: string; read_at: string | null; created_at: string };
export type LiveBlock = { blocked_id: string; created_at: string };
export type LiveReport = { id: string; reported_id: string; reason: string; status: 'pending' | 'reviewed' | 'resolved'; created_at: string };
export async function loadAccountTools() {
  const results = await Promise.all([
    client().from('blocks').select('blocked_id,created_at').order('created_at', { ascending: false }),
    client().from('notifications').select('id,kind,letter_id,read_at,created_at').order('id', { ascending: false }).limit(100),
    client().from('reports').select('id,reported_id,reason,status,created_at').order('created_at', { ascending: false }).limit(100),
  ]);
  for (const result of results) if (result.error) throw new Error(result.error.message);
  return { blocks: results[0].data as LiveBlock[], notifications: results[1].data as LiveNotification[], reports: results[2].data as LiveReport[] };
}
export const markNotificationsRead = (throughId: number) => rpc<void>('mark_notifications_read', { p_through_id: throughId });

export async function loadMessages(room: string, before?: Pick<LiveMessage, 'created_at' | 'id'>): Promise<LiveMessage[]> {
  const rows = await rpc<LiveMessage[]>('message_history', {
    p_conversation: room, p_before_at: before?.created_at ?? null, p_before_id: before?.id ?? null,
  });
  return rows.reverse();
}

// The existing discovery presentation receives server-filtered public profiles.
// An empty birthday is intentional: other people's birthdates are never sent.
export function explorerProfiles(people: LiveProfile[]): Person[] {
  const colors = ['#DDE8DA', '#F1D9C4', '#E3DDF1', '#D3E7EB'];
  return people.map((p, i) => ({ id: p.id, name: p.name, birthday: '', city: p.country, country: p.country, interests: p.interests, initials: p.name.slice(0, 2).toUpperCase(), color: colors[i % colors.length], letter: p.bio }));
}
export function discoveryState(snapshot: LiveSnapshot): PostState {
  const a = snapshot.account;
  return {
    version: 1, profile: a ? { name: a.profile.name, birthday: a.birthday, interests: a.profile.interests } : null,
    points: a?.points || 0, blocked: [], reports: [], conversations: [],
    letters: snapshot.letters.map(l => ({ id: l.id, text: l.body, courier: l.courier, personId: l.sender_id === a?.profile.id ? l.recipient_id : l.sender_id,
      direction: l.sender_id === a?.profile.id ? 'outgoing' : 'incoming', status: l.status, sentAt: Date.parse(l.sent_at), arrivesAt: Date.parse(l.arrives_at), expiresAt: Date.parse(l.expires_at), visited: [] })),
  };
}

export const claimDailyReward = () => rpc<DailyReward>('claim_daily_reward');
export const startRiddle = (clientId: string) => rpc<RiddleRound>('start_riddle', { p_client_id: clientId });
export const answerRiddle = (id: string, answer: string) => rpc<RiddleRound>('answer_riddle', { p_round: id, p_answer: answer });
