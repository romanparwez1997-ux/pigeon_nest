import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { randomUUID } from 'expo-crypto';
import type { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, serif } from '../theme';
import { Icon, IconName } from '../components/Artwork';
import { TranslationPanel } from '../components/TranslationPanel';
import { ExploreScreen } from '../screens/ExploreScreen';
import { GameChoice, GameResult, GamesScreen } from '../screens/GamesScreen';
import { ageAt, Destination, GameStats, Interest, INTERESTS } from '../domain/model';
import { backendConfigError, supabase } from './client';
import { block, report, createProfile, decide, discoveryState, explorerProfiles, LiveSnapshot, loadSnapshot, postLetter } from './api';

import { AuthScreen } from './AuthScreen';
import { AccountSettings } from './AccountSettings';
import { Action, Field } from './ui';
import { DailyRewardCard, RewardsPanel } from './RewardsPanel';
import { PremiumPanel } from './PremiumPanel';
import { useLetterDraft } from './useLetterDraft';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CommunicationActivity, PresenceLabel } from '../communications/Presence';
import { CallHistory } from '../communications/CallHistory';
import { ChatRoom } from '../communications/ChatRoom';
import { CallOverlay, callsSupported } from '../communications/CallOverlay';
import { Call, invoke, startCall } from '../communications/api';
import { NotificationSettings } from '../communications/NotificationSettings';
import { listenForNotifications, removeDevicePush } from '../communications/notifications';
const Stack = createNativeStackNavigator<{ PostOffice: undefined; Conversation: { id: string } }>();

type Page = 'Explore' | 'Mailbox' | 'Chats' | 'Play' | 'Passport';
const pages: { title: Page; icon: IconName }[] = [{ title: 'Explore', icon: 'compass' }, { title: 'Mailbox', icon: 'mail' }, { title: 'Chats', icon: 'chat' }, { title: 'Play', icon: 'game' }, { title: 'Passport', icon: 'passport' }];
const blank: LiveSnapshot = { account: null, people: [], letters: [], conversations: [] };

export function LiveApp() {
  const navigation = useNavigationContainerRef<{ PostOffice: undefined; Conversation: { id: string } }>();
  const [chatTab, setChatTab] = useState<'messages' | 'calls'>('messages');
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const notificationRoom = useRef<string | null>(null);
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const rail = width - insets.left - insets.right >= 840 && height - insets.top - insets.bottom >= 500 * fontScale && fontScale < 1.6;
  const padding = width < 360 ? 12 : width >= 760 ? 32 : 20;
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<LiveSnapshot>(blank);
  const [page, setPage] = useState<Page>('Explore');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [country, setCountry] = useState('');
  const [interests, setInterests] = useState<Interest[]>([]);
  const [modal, setModal] = useState<'compose' | 'letter' | 'translate' | 'report' | 'rewards' | 'premium' | null>(null);
  const [letterId, setLetterId] = useState<string | null>(null);
  const [mailTab, setMailTab] = useState<'received' | 'sent'>('received');
  const [translation, setTranslation] = useState('');
  const [reportUser, setReportUser] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [game, setGame] = useState<GameChoice>(null);
  const [gameStats, setGameStats] = useState<GameStats>();
  const working = useRef(false);
  const currentUser = useRef<string | null>(null);
  const loadVersion = useRef(0);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const content = useRef<ScrollView>(null);
  const userId = session?.user.id || null;
  const account = data.account;
  const savedDraft = useLetterDraft(userId);
  const { target, courier, body: letterBody } = savedDraft.draft;
  const setTarget = (target: Destination) => savedDraft.update({ target });
  const setCourier = (courier: 'pigeon' | 'postman') => savedDraft.update({ courier });
  const setLetterBody = (body: string) => savedDraft.update({ body });
  const personName = (id: string) => id === userId ? account?.profile.name || 'You' : data.people.find(p => p.id === id)?.name || 'Explorer';

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    let alive = true;
    const change = (next: Session | null) => {
      if (!alive) return;
      if (currentUser.current !== (next?.user.id || null)) {
        currentUser.current = next?.user.id || null;
        loadVersion.current++;
        setActiveCall(null); setData(blank); setLoaded(false); setModal(null); setGameStats(undefined);
        setError(''); setNotice(''); setReportUser(null); setReportReason(''); setTranslation(''); setPage('Explore'); setName(''); setBirthday(''); setCountry(''); setInterests([]); request.current = null;
      }
      setSession(next); setAuthReady(true);
    };
    supabase.auth.getSession().then(({ data, error }) => { if (error) throw error; change(data.session); }).catch(e => { if (alive) { setError(e.message); setAuthReady(true); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => change(next));
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  const refresh = useCallback(async () => {
    if (!currentUser.current) return;
    const owner = currentUser.current;
    const version = ++loadVersion.current;
    const next = await loadSnapshot();
    if (owner !== currentUser.current || version !== loadVersion.current) return;
    setData(next); setLoaded(true);

  }, []);

  useEffect(() => {
    if (!userId || !supabase) return;
    const update = () => { refresh().catch(e => setError(e.message)); };
    update();
    const channel = supabase.channel(`post-office-${userId}`);
    let debounce: ReturnType<typeof setTimeout> | undefined;
    for (const table of ['letters', 'conversations', 'notifications']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => { clearTimeout(debounce); debounce = setTimeout(update, 250); });
    }
    channel.subscribe();
    const interval = setInterval(update, 30000);
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    let alive = true;
    AsyncStorage.getItem(`pigeon-post.live.games.${userId}`).then(raw => { if (alive && raw) { const value = JSON.parse(raw); if (Number.isFinite(value.rounds) && Number.isFinite(value.ticWins)) setGameStats(value); } }).catch(() => {});
    return () => { alive = false; clearTimeout(debounce); clearInterval(interval); foreground.remove(); void supabase?.removeChannel(channel); };
  }, [userId, refresh]);

  useEffect(() => { content.current?.scrollTo({ y: 0, animated: false }); }, [page]);

  async function run(work: () => Promise<unknown>, success?: (value: unknown) => void) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); setNotice('');
    try { const value = await work(); request.current = null; success?.(value); if (currentUser.current) await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'The request failed. Please try again.'); }
    finally { working.current = false; setBusy(false); }
  }
  const requestId = (signature: string) => {
    if (!request.current || request.current.signature !== signature) request.current = { signature, id: randomUUID() };
    return request.current.id;
  };
  const write = (destination?: Destination, prompt?: string) => { if (destination) setTarget(destination); if (prompt !== undefined) setLetterBody(prompt); setError(''); setModal('compose'); };
  const showTranslation = (text: string) => { setTranslation(text); setError(''); setModal('translate'); };
  const currentLetter = data.letters.find(l => l.id === letterId);
  const letters = data.letters.filter(l => mailTab === 'sent' ? l.sender_id === userId : l.recipient_id === userId && l.status === 'arrived' && Date.parse(l.expires_at) > Date.now() && !!l.respond_by && Date.parse(l.respond_by) > Date.now());
  const countryOptions = [...new Set(data.people.map(p => p.country))];
  const targetLabel = target.kind === 'person' ? personName(target.personId) : target.kind === 'country' ? target.country : 'Anywhere';

  function openChat(id: string) {
    setPage('Chats');
    if (navigation.isReady()) navigation.navigate('Conversation', { id });
    else notificationRoom.current = id;
  }
  async function beginCall(room: string, kind: Call['kind']) {
    if (!account?.premium) { setModal('premium'); return; }
    if (!callsSupported()) { setError('Calls require a development or store build. Expo Go does not include the calling SDK.'); return; }
    await run(async () => { await invoke('call-session', { action: 'ready' }); const call = await startCall(room, kind, requestId(JSON.stringify(['call', room, kind]))); setActiveCall(call); });
  }
  useEffect(() => {
    if (!userId || !account) return;
    let disposed = false; let stop = () => {};
    void listenForNotifications(userId, id => { if (!disposed) openChat(id); }).then(cleanup => { if (disposed) cleanup(); else stop = cleanup; }).catch(() => {});
    return () => { disposed = true; stop(); };
  }, [userId, !!account]);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (navigation.isReady() && navigation.canGoBack()) return false;
      if (game && page === 'Play') { setGame(null); return true; }
      if (page !== 'Explore') { setPage('Explore'); return true; }
      return false;
    });
    return () => back.remove();
  }, [page, game, navigation]);

  const interestChoices = <View style={s.chips}>{INTERESTS.map(i => <Pressable key={i} accessibilityRole="checkbox" accessibilityState={{ checked: interests.includes(i) }} onPress={() => setInterests(a => a.includes(i) ? a.filter(v => v !== i) : [...a, i])} style={[s.chip, interests.includes(i) && s.chipSelected]}><Text style={[s.chipText, interests.includes(i) && { color: '#fff' }]}>{i}</Text></Pressable>)}</View>;
  const profileForm = <View style={s.form}><Text style={s.eyebrow}>YOUR REAL JOURNEY STARTS HERE</Text><Text style={s.title}>Create your passport.</Text><Text style={s.body}>Choose at least three interests. Ages 16–17 and adults have separate friendship circles.</Text><Field label="First name" value={name} onChange={setName} maxLength={30} /><Field label="Date of birth (YYYY-MM-DD)" value={birthday} onChange={setBirthday} maxLength={10} autoCapitalize="none" /><Field label="Country" value={country} onChange={setCountry} placeholder="e.g. India" maxLength={60} /><Text style={s.label}>Your interests</Text>{interestChoices}<Text style={s.small}>Your date of birth is private and cannot be changed in the app.</Text><Action title="Create my passport" disabled={busy} onPress={() => run(async () => { if (ageAt(birthday) === null) throw new Error('Enter a valid date in YYYY-MM-DD format.'); await createProfile(name, birthday, country, interests); })} /></View>;

  return <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={s.root}><StatusBar style="dark" /><View style={s.header}><View style={s.row}><Icon name="bird" size={28} /><Text style={s.brand}>pigeon post.</Text></View><View style={s.row}>{(!account || account.premium) && <Text style={s.small}>{account ? "PIGEON PLUS" : "LIVE ACCOUNTS"}</Text>}{account && <Pressable accessibilityRole="button" accessibilityLabel="Open rewards and postage pouch" onPress={() => setModal('rewards')}><Text style={s.points}>{account.points} points</Text></Pressable>}</View></View>
    {!!backendConfigError && <View style={s.form}><Text style={s.title}>Finish the connection.</Text><Text style={s.error}>{backendConfigError}</Text></View>}
    {!backendConfigError && <>
    {!!error && <View accessibilityRole="alert" style={s.errorBox}><Text style={s.error}>{error}</Text>{userId && <Pressable accessibilityRole="button" onPress={() => run(refresh)}><Text style={s.link}>Retry connection</Text></Pressable>}</View>}
    {!!notice && <Text accessibilityRole="alert" style={s.notice}>{notice}</Text>}
    {!authReady ? <ActivityIndicator style={{ marginTop: 60 }} color={C.green} /> : !session || recovering ? <AuthScreen onRecovery={setRecovering} /> : !loaded ? <View style={s.form}><ActivityIndicator color={C.green} /><Text style={s.body}>Opening your post office…</Text><Action title="Sign out" secondary disabled={busy} onPress={() => run(async () => { await removeDevicePush(); const r = await supabase!.auth.signOut(); if (r.error) throw r.error; })} /></View> : !account ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.authContent}>{profileForm}<AccountSettings key={userId!} account={null} userId={userId!} onRefresh={refresh} onLetter={() => {}} /><Action title="Use another account" secondary disabled={busy} onPress={() => run(async () => { await removeDevicePush(); const r = await supabase!.auth.signOut(); if (r.error) throw r.error; })} /></ScrollView> : <>
    <CommunicationActivity key={userId!} userId={userId!}/><NavigationContainer ref={navigation} onReady={() => { if (notificationRoom.current) { openChat(notificationRoom.current); notificationRoom.current = null; } }}><Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: true, contentStyle: { backgroundColor: C.bg } }}><Stack.Screen name="PostOffice">{() => <>
    {!account.profile.active && <Text style={s.errorBox}>This account is inactive. Contact support before starting a new conversation.</Text>}
    <View style={[s.shell, rail && s.shellWide]}><KeyboardAvoidingView style={{ flex: 1, minWidth: 0, overflow: 'hidden' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView ref={content} style={{ width: '100%' }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); refresh().catch(e => setError(e.message)).finally(() => setRefreshing(false)); }} />} contentContainerStyle={[s.content, { padding, maxWidth: page === 'Chats' ? 780 : 1000 }]}>
      {page === 'Explore' && <ExploreScreen rewards={<DailyRewardCard account={account} onOpen={() => setModal('rewards')} />} onPremium={() => setModal('premium')} state={discoveryState(data)} discoveryPeople={explorerProfiles(data.people)} onWrite={write} onPlay={choice => { setGame(choice); setPage('Play'); }} onTranslate={() => showTranslation('')} onMailbox={() => setPage('Mailbox')} onLetter={id => { setLetterId(id); setModal('letter'); }} onPassport={() => setPage('Passport')} />}
      {page === 'Mailbox' && <View style={{ gap: 20 }}><Text style={s.eyebrow}>THE REAL PIGEON EXPRESS</Text><Text style={s.title}>Your mailbox.</Text><View style={s.row}><Action title="Received" secondary={mailTab !== 'received'} onPress={() => setMailTab('received')} /><Action title="Sent" secondary={mailTab !== 'sent'} onPress={() => setMailTab('sent')} /><Pressable accessibilityRole="button" onPress={() => write()} style={{ padding: 12 }}><Icon name="send" /></Pressable></View><Text style={s.body}>Pigeons travel for 15 minutes. Postmen take an hour. You have 24 hours to keep an arriving letter.</Text>{letters.map(l => <Pressable key={l.id} accessibilityRole="button" onPress={() => { setLetterId(l.id); setModal('letter'); }} style={s.card}><View style={s.row}><Icon name={l.courier === 'pigeon' ? 'bird' : 'postman'} /><Text style={s.person}>{l.sender_id === userId ? 'To' : 'From'} {personName(l.sender_id === userId ? l.recipient_id : l.sender_id)}</Text><Text style={s.small}>{l.status}</Text></View><Text style={s.body} numberOfLines={2}>{l.body}</Text><Text style={s.small}>{l.status === 'traveling' ? `Expected ${new Date(l.arrives_at).toLocaleString()}` : new Date(l.sent_at).toLocaleString()}</Text></Pressable>)}{!letters.length && <View style={s.card}><Text style={s.body}>No letters here yet. A small hello is a good place to start.</Text><Action title="Write a letter" onPress={() => write()} /></View>}</View>}
      {page === 'Chats' && <View style={{ gap: 17 }}><Text style={s.title}>Your conversations.</Text><View style={s.row}><Action title="Messages" secondary={chatTab!=='messages'} onPress={()=>setChatTab('messages')}/><Action title="Call history" secondary={chatTab!=='calls'} onPress={()=>setChatTab('calls')}/></View>{chatTab==='calls'?<CallHistory userId={userId!} personName={personName} onOpen={openChat} allowedConversations={data.conversations.map(c=>c.id)}/>:<><Text style={s.body}>Keep a letter to open a chat.</Text>{data.conversations.map(c => { const id = c.member_a === userId ? c.member_b : c.member_a; return <Pressable accessibilityRole="button" key={c.id} style={s.card} onPress={() => openChat(c.id)}><View style={s.row}><Icon name="chat" /><Text style={s.person}>{personName(id)}</Text><Icon name="chevron" size={17} /></View><PresenceLabel conversationId={c.id}/></Pressable>; })}{!data.conversations.length && <Action title="Visit your mailbox" onPress={() => setPage('Mailbox')} />}</>}</View>}

      {page === 'Play' && <GamesScreen selected={game} onSelect={setGame} stats={gameStats} onRecord={(result: GameResult) => { const old = gameStats || { rounds: 0, ticWins: 0 }; const next = { ...old, rounds: old.rounds + 1, ticWins: old.ticWins + (result.kind === 'tic' && result.won ? 1 : 0), memoryBest: result.kind === 'memory' ? Math.min(old.memoryBest ?? Infinity, result.moves) : old.memoryBest }; setGameStats(next); AsyncStorage.setItem(`pigeon-post.live.games.${userId}`, JSON.stringify(next)).catch(() => setNotice('This game score could not be saved on this device.')); }} />}
      {page === 'Passport' && <View style={{ gap: 20 }}><Text style={s.eyebrow}>YOUR EXPLORER PASSPORT</Text><Text style={s.title}>{account.profile.name}</Text><View style={s.passport}><Icon name="globe" color="#DFE9D5" size={35} /><Text style={s.passportName}>{account.profile.country}</Text><Text style={{ color: '#CFDCC5', lineHeight: 22 }}>{(ageAt(account.birthday) ?? 0) < 18 ? '16–17 friendship circle' : '18+ friendship circle'} · {account.points} postage points</Text><Text style={{ color: '#CFDCC5', lineHeight: 22 }}>{account.profile.interests.join(' · ')}</Text></View><Text style={s.body}>Your letters and conversations are stored in your account. Demo profiles and messages are kept separate and are never uploaded.</Text><Action title={account.premium ? "Manage Pigeon Plus" : "Discover Pigeon Plus"} secondary onPress={() => setModal('premium')} /><Action title="Daily gifts & postage pouch" secondary onPress={() => setModal('rewards')} /><NotificationSettings userId={userId!} /><AccountSettings key={userId!} account={account} userId={userId!} onRefresh={refresh} onLetter={id => { setLetterId(id); setModal('letter'); }} /><Action title="Refresh account" secondary disabled={busy} onPress={() => run(refresh)} /><Action title="Sign out" secondary disabled={busy} onPress={() => run(async () => { await removeDevicePush(); const r = await supabase!.auth.signOut(); if (r.error) throw r.error; })} /></View>}
    </ScrollView></KeyboardAvoidingView>
    <View style={[s.nav, { width: width - insets.left - insets.right }, rail && s.rail]}>{pages.map(p => <Pressable key={p.title} accessibilityRole="tab" accessibilityState={{ selected: page === p.title }} onPress={() => { setPage(p.title); setError(''); }} style={[s.navItem, rail && s.railItem, page === p.title && rail && s.selectedNav]}><Icon name={p.icon} color={page === p.title ? C.green : C.muted} /><Text style={[s.navText, page === p.title && { fontWeight: '700', color: C.green }]}>{p.title}</Text></Pressable>)}</View></View>
    </>}</Stack.Screen><Stack.Screen name="Conversation">{({ route, navigation: nav }) => { const c = data.conversations.find(c => c.id === route.params.id); const peer = c ? c.member_a === userId ? c.member_b : c.member_a : null; return peer ? <ChatRoom key={route.params.id} conversationId={route.params.id} userId={userId!} name={personName(peer)} premium={account.premium} readingEnabled={!modal && !activeCall} onBack={() => nav.goBack()} onReport={() => { setReportUser(peer); setReportReason(''); setModal('report'); }} onTranslate={showTranslation} onCall={kind => void beginCall(route.params.id, kind)} /> : <View style={s.form}><Text style={s.body}>This conversation is no longer available.</Text><Action title="Back to chats" onPress={() => nav.goBack()} /></View>; }}</Stack.Screen></Stack.Navigator></NavigationContainer>
    <CallOverlay key={userId!} userId={userId!} selected={activeCall} onSelected={setActiveCall} />
    </>}
    </>}
    <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right']} visible={modal !== null} transparent animationType="fade" onRequestClose={() => { if (!busy) setModal(null); }}><KeyboardAvoidingView style={[s.shade, { paddingTop: Math.max(12, insets.top), paddingBottom: Math.max(12, insets.bottom), paddingLeft: Math.max(12, insets.left), paddingRight: Math.max(12, insets.right) }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={s.modal}><View style={s.modalTop}><Text style={[s.eyebrow, { flex: 1 }]}>PIGEON POST · YOUR ACCOUNT</Text><Pressable accessibilityRole="button" accessibilityLabel="Close dialog" disabled={busy} onPress={() => setModal(null)} style={{ padding: 12 }}><Icon name="close" /></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingTop: 0, gap: 17 }}>
      {modal === 'compose' && <><Text style={s.title}>A hello to {targetLabel}.</Text>{!savedDraft.ready && <ActivityIndicator color={C.green} />}{!!savedDraft.error && <Text accessibilityRole="alert" style={s.error}>{savedDraft.error}</Text>}<View style={s.chips}>{(['anywhere', 'country', 'person'] as const).map(kind => <Pressable accessibilityRole="radio" accessibilityState={{ checked: target.kind === kind }} key={kind} onPress={() => setTarget(kind === 'anywhere' ? { kind } : kind === 'country' ? { kind, country: countryOptions[0] || '' } : { kind, personId: data.people[0]?.id || '' })} style={[s.chip, target.kind === kind && s.chipSelected]}><Text style={[s.chipText, target.kind === kind && { color: '#fff' }]}>{kind === 'anywhere' ? 'Anywhere' : kind === 'country' ? 'A country' : 'An explorer'}</Text></Pressable>)}</View>{target.kind === 'country' && <Field label="Destination country" value={target.country} onChange={v => setTarget({ kind: 'country', country: v })} placeholder="e.g. India" maxLength={60} />}{target.kind === 'person' && <View style={s.chips}>{data.people.map(p => <Pressable accessibilityRole="radio" accessibilityState={{ checked: target.personId === p.id }} key={p.id} onPress={() => setTarget({ kind: 'person', personId: p.id })} style={[s.chip, target.personId === p.id && s.chipSelected]}><Text style={[s.chipText, target.personId === p.id && { color: '#fff' }]}>{p.name} · {p.country}</Text></Pressable>)}</View>}<Text style={s.small}>{target.kind === 'person' ? 'Only this person receives the letter. If declined, its journey ends.' : 'Letters only travel within the selected destination and your friendship circle.'}</Text><View style={s.row}><Action title="Pigeon · 15 min" secondary={courier !== 'pigeon'} onPress={() => setCourier('pigeon')} /><Action title="Postman · 1 hour" secondary={courier !== 'postman'} onPress={() => setCourier('postman')} /></View><Field label="Your letter" value={letterBody} onChange={setLetterBody} editable={savedDraft.ready} multiline maxLength={800} textAlignVertical="top" style={[s.input, { minHeight: 160 }]} /><Text style={s.small}>{letterBody.length}/800 characters · {account?.rewards?.[courier] ? '1 free delivery · no points needed' : '10 postage points'}</Text><Action title={busy ? 'Sending…' : 'Send this hello'} disabled={busy || !savedDraft.ready || letterBody.trim().length < 20} onPress={() => run(() => postLetter(letterBody, courier, target, requestId(JSON.stringify(['letter', letterBody, courier, target]))), () => { setLetterBody(''); setModal(null); setMailTab('sent'); setPage('Mailbox'); setNotice('Your courier is on its way. Delivery continues even when you close the app.'); })} /></>}
      {modal === 'letter' && currentLetter && <><Text style={s.title}>{currentLetter.sender_id === userId ? 'Your travelling hello.' : `A hello from ${personName(currentLetter.sender_id)}.`}</Text><View style={s.paper}><Text style={s.letterText}>{currentLetter.body}</Text></View><Text style={s.body}>{currentLetter.status} · {currentLetter.courier} · stop {currentLetter.attempt_count}</Text><Text style={s.small}>{currentLetter.status === 'traveling' ? `Expected arrival: ${new Date(currentLetter.arrives_at).toLocaleString()}` : currentLetter.respond_by && currentLetter.status === 'arrived' ? `Reply by: ${new Date(currentLetter.respond_by).toLocaleString()}` : ''}</Text><Action title="Translate this letter" secondary onPress={() => showTranslation(currentLetter.body)} />{currentLetter.recipient_id === userId && currentLetter.status === 'arrived' && <><Action title="Keep letter & say hello" disabled={busy} onPress={() => run(() => decide(currentLetter.id, true), room => { openChat(room as string); setPage('Chats'); setModal(null); })} /><Action title="Let it travel on" secondary disabled={busy} onPress={() => run(() => decide(currentLetter.id, false), () => setModal(null))} /><Action title="Report or block" secondary disabled={busy} onPress={() => { setReportUser(currentLetter.sender_id); setReportReason(''); setModal('report'); }} /></>}</>}
      {modal === 'letter' && !currentLetter && <Text style={s.body}>This letter is no longer available.</Text>}
      {modal === 'rewards' && account && <RewardsPanel key={userId!} account={account} onRefresh={refresh} />}
      {modal === 'premium' && account && <PremiumPanel key={userId!} account={account} onRefresh={refresh} />}
      {modal === 'translate' && <TranslationPanel initialText={translation} />}
      {modal === 'report' && reportUser && <><Text style={s.title}>Your comfort comes first.</Text><Text style={s.body}>Blocking removes this explorer from discovery and closes your conversation on both sides. After unblocking, a new letter must be accepted to chat again.</Text><Field label="Report reason (optional for blocking)" value={reportReason} onChange={setReportReason} maxLength={1000} multiline /><Action title="Submit report only" secondary disabled={busy || reportReason.trim().length < 3} onPress={() => run(() => report(reportUser, reportReason), () => { setModal(null); setNotice('Your report has been saved for review.'); })} /><Action title="Report & block" disabled={busy || reportReason.trim().length < 3} onPress={() => run(() => block(reportUser, reportReason), () => { setModal(null); setNotice('Explorer blocked. Your report has been saved for review.'); })} /><Action title="Block without reporting" secondary disabled={busy} onPress={() => run(() => block(reportUser, null), () => { setModal(null); setNotice('Explorer blocked.'); })} /></>}
      {!!error && <Text accessibilityRole="alert" style={s.errorBox}>{error}</Text>}
    </ScrollView></View></KeyboardAvoidingView></Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  shell: { flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, width: '100%' }, shellWide: { flexDirection: 'row-reverse' }, rail: { width: 120, flexDirection: 'column', borderTopWidth: 0, borderRightWidth: 1, padding: 12, gap: 12 }, railItem: { flex: 0, flexBasis: 'auto', flexShrink: 0, paddingVertical: 10, borderRadius: 12 }, selectedNav: { backgroundColor: '#E5EDDC' },
  root: { flex: 1, width: '100%', backgroundColor: C.bg }, header: { paddingHorizontal: 20, paddingVertical: 19, minHeight: 77, borderBottomWidth: 1, borderColor: C.line, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, brand: { fontFamily: serif, fontSize: 26, color: C.ink, fontWeight: '600', letterSpacing: -.8 }, liveDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: '#789E69' }, points: { fontSize: 11, color: C.green, padding: 9, backgroundColor: '#ECEBDC', borderRadius: 20 }, authContent: { padding: 24, alignItems: 'center', gap: 20 }, form: { width: '100%', maxWidth: 470, padding: 24, gap: 18, alignSelf: 'center' }, eyebrow: { fontSize: 9, letterSpacing: 1.5, fontWeight: '700', color: C.rust }, title: { fontFamily: serif, fontSize: 31, lineHeight: 39, color: C.ink, letterSpacing: -.6 }, body: { color: C.muted, fontSize: 14, lineHeight: 23 }, small: { fontSize: 10, lineHeight: 17, color: C.muted }, label: { color: C.ink, fontSize: 12, fontWeight: '600' }, input: { minWidth: 0, borderWidth: 1, borderColor: '#D8DFD0', borderRadius: 9, backgroundColor: '#FFF', padding: 14, minHeight: 48, color: C.ink, fontSize: 15, lineHeight: 23 }, action: { backgroundColor: C.green, minHeight: 46, paddingVertical: 13, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#CAD6C2' }, actionText: { color: '#fff', fontSize: 12, fontWeight: '600' }, link: { color: C.green, fontSize: 12, fontWeight: '600', paddingVertical: 8 }, errorBox: { backgroundColor: '#F6E2DA', padding: 15, borderRadius: 8, margin: 10, gap: 7 }, error: { color: '#934F40', fontSize: 13, lineHeight: 20 }, notice: { color: C.green, backgroundColor: '#E5EDDC', padding: 15, fontSize: 12, lineHeight: 20 }, content: { width: '100%', maxWidth: 1100, alignSelf: 'center', paddingBottom: 32 }, card: { backgroundColor: '#FDFCF7', borderWidth: 1, borderColor: C.line, padding: 21, borderRadius: 13, gap: 13 }, person: { color: C.ink, fontSize: 15, fontWeight: '600', flex: 1 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { paddingHorizontal: 13, paddingVertical: 11, borderRadius: 20, backgroundColor: '#E9EDE2' }, chipSelected: { backgroundColor: C.green }, chipText: { fontSize: 12, color: C.green }, nav: { gap: 0, paddingHorizontal: 0, borderRightWidth: 0, width: '100%', flexDirection: 'row', borderTopWidth: 1, borderColor: C.line, backgroundColor: '#FCFAF3', paddingVertical: 12 }, navItem: { flex: 1, flexBasis: 0, flexShrink: 1, paddingVertical: 0, minWidth: 0, minHeight: 48, justifyContent: 'center', alignItems: 'center', gap: 6 }, navText: { fontSize: 10, textAlign: 'center', color: C.muted }, bubble: { padding: 17, borderRadius: 15, maxWidth: '88%', gap: 13 }, mine: { backgroundColor: C.green, alignSelf: 'flex-end', borderBottomRightRadius: 3 }, theirs: { backgroundColor: '#E6EBDE', alignSelf: 'flex-start', borderBottomLeftRadius: 3 }, message: { color: C.ink, fontSize: 15, lineHeight: 24 }, composer: { width: '100%', maxWidth: 780, alignSelf: 'center', padding: 14, flexDirection: 'row', alignItems: 'flex-end', gap: 10, borderTopWidth: 1, borderColor: C.line }, passport: { borderRadius: 18, backgroundColor: C.green, padding: 29, gap: 18 }, passportName: { color: '#F7F5E8', fontFamily: serif, fontSize: 36 }, shade: { flex: 1, backgroundColor: '#10261FAA', padding: 16, alignItems: 'center', justifyContent: 'center' }, modal: { width: '100%', maxWidth: 550, maxHeight: '100%', backgroundColor: C.bg, borderRadius: 18, overflow: 'hidden' }, modalTop: { paddingHorizontal: 22, paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, paper: { padding: 24, borderRadius: 11, backgroundColor: '#F2EBDD' }, letterText: { color: '#58634D', fontFamily: serif, fontSize: 19, lineHeight: 30 },
});
