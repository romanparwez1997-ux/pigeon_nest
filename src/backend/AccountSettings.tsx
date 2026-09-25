import { removeDevicePush } from '../communications/notifications';
import { letterDraftStore } from './useLetterDraft';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Interest, INTERESTS } from '../domain/model';
import { C } from '../theme';
import { Account, deleteAccount, loadAccountTools, markNotificationsRead, unblock, updateProfile } from './api';
import { supabase } from './client';
import { Action, Field, ui } from './ui';

export function AccountSettings({ account, userId, onRefresh, onLetter }: { account: Account | null; userId: string; onRefresh: () => Promise<void>; onLetter: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState<Interest[]>([]);
  const [languages, setLanguages] = useState('en');
  const [tools, setTools] = useState<Awaited<ReturnType<typeof loadAccountTools>>>({ blocks: [], notifications: [], reports: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const working = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const refresh = () => loadAccountTools().then(value => { if (alive.current) setTools(value); }).catch(e => { if (alive.current) setError(e.message); });
    void refresh();
    const timer = setInterval(refresh, 30000);
    return () => { alive.current = false; clearInterval(timer); };
  }, [userId]);
  async function run(work: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await work();
      if (alive.current) { await onRefresh(); const next = await loadAccountTools(); if (alive.current) setTools(next); }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  function edit() {
    if (!account) return;
    setName(account.profile.name); setCountry(account.profile.country); setBio(account.profile.bio);
    setInterests(account.profile.interests); setLanguages(account.profile.languages.join(', ')); setEditing(true);
  }
  return <View style={{ gap: 18 }}>
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    {!!notice && <Text accessibilityRole="alert" style={ui.notice}>{notice}</Text>}
    {account?.profile.active && !editing && <Action title="Edit passport" secondary disabled={busy} onPress={edit} />}
    {editing && account && <View style={ui.card}>
      <Text style={ui.title}>Edit your passport.</Text>
      <Field label="First name" value={name} onChange={setName} maxLength={30} />
      <Field label="Country" value={country} onChange={setCountry} maxLength={60} />
      <Field label="About you" value={bio} onChange={setBio} maxLength={300} multiline />
      <Field label="Language codes, separated by commas" value={languages} onChange={setLanguages} autoCapitalize="none" placeholder="en, hi" maxLength={60} />
      <Text style={ui.small}>Choose at least three interests. Your date of birth cannot be changed.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{INTERESTS.map(interest => <Pressable key={interest} accessibilityRole="checkbox" accessibilityState={{ checked: interests.includes(interest) }} onPress={() => setInterests(old => old.includes(interest) ? old.filter(i => i !== interest) : [...old, interest])} style={{ padding: 12, borderRadius: 20, backgroundColor: interests.includes(interest) ? C.green : '#E9EDE2' }}><Text style={{ color: interests.includes(interest) ? '#fff' : C.green }}>{interest}</Text></Pressable>)}</View>
      <Action title="Save passport" disabled={busy || !name.trim() || country.trim().length < 2 || interests.length < 3} onPress={() => run(async () => {
        const codes = [...new Set(languages.split(',').map(l => l.trim().toLowerCase()).filter(Boolean))];
        if (codes.length < 1 || codes.length > 8 || codes.some(l => !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(l))) throw new Error('Enter 1–8 language codes, such as en, hi, or pt-br.');
        await updateProfile({ name, country, bio, interests, languages: codes }); setEditing(false); setNotice('Passport updated.');
      })} />
      <Action title="Cancel editing" secondary disabled={busy} onPress={() => setEditing(false)} />
    </View>}
    {account && <>
      <View style={ui.card}><Text style={ui.title}>Notifications.</Text>
        {!tools.notifications.length && <Text style={ui.body}>Letter arrivals and acceptances will appear here.</Text>}
        {tools.notifications.some(n => !n.read_at) && <Action title="Mark shown notifications read" secondary disabled={busy} onPress={() => run(async () => { await markNotificationsRead(tools.notifications[0].id); })} />}
        {tools.notifications.map(n => <Pressable key={n.id} accessibilityRole="button" onPress={() => onLetter(n.letter_id)}><Text style={[ui.body, !n.read_at && { color: C.green, fontWeight: '700' }]}>{n.kind === 'letter_arrived' ? 'A letter has arrived' : 'Your letter was accepted'} · {new Date(n.created_at).toLocaleString()}{!n.read_at ? ' · Unread' : ''}</Text></Pressable>)}
      </View>
      <View style={ui.card}><Text style={ui.title}>Blocked explorers.</Text><Text style={ui.small}>Unblocking allows new letters. A new letter must be accepted before a closed conversation can reopen.</Text>
        {!tools.blocks.length && <Text style={ui.body}>No blocked explorers.</Text>}
        {tools.blocks.map(b => <View key={b.blocked_id} style={{ gap: 8 }}><Text style={ui.small}>Explorer {b.blocked_id.slice(0, 8)} · blocked {new Date(b.created_at).toLocaleDateString()}</Text><Action title={`Unblock explorer ${b.blocked_id.slice(0, 8)}`} secondary disabled={busy || !account.profile.active} onPress={() => run(async () => { await unblock(b.blocked_id); setNotice('Block removed.'); })} /></View>)}
      </View>
      <View style={ui.card}><Text style={ui.title}>Your reports.</Text>
        {!tools.reports.length && <Text style={ui.body}>No reports submitted.</Text>}
        {tools.reports.map(r => <View key={r.id}><Text style={ui.body}>{r.reason}</Text><Text style={ui.small}>{r.status} · {new Date(r.created_at).toLocaleDateString()}</Text></View>)}
      </View>
    </>}
    <Action title="Refresh account tools" secondary disabled={busy} onPress={() => run(async () => {})} />
    {!deleting ? <Action title="Delete my account" secondary disabled={busy} onPress={() => setDeleting(true)} /> : <View style={ui.card}>
      <Text style={ui.title}>Delete your account?</Text><Text style={ui.body}>This permanently removes your login, passport, letters, shared conversations, reports, and postage points. This cannot be undone.</Text>
      <Field label="Type DELETE to confirm" value={confirmation} onChange={setConfirmation} autoCapitalize="characters" autoCorrect={false} />
      <Action title="Permanently delete my account" disabled={busy || confirmation !== 'DELETE'} onPress={() => run(async () => {
        await removeDevicePush();
        await deleteAccount(confirmation);
        await letterDraftStore.clear(userId).catch(() => {});
        await AsyncStorage.removeItem(`pigeon-post.live.games.${userId}`).catch(() => {});
        const { error } = await supabase!.auth.signOut({ scope: 'local' });
        if (error) throw error;
      })} />
      <Action title="Keep my account" secondary disabled={busy} onPress={() => { setDeleting(false); setConfirmation(''); }} />
    </View>}
  </View>;
}
