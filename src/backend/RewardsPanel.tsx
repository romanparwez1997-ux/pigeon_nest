import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../components/Artwork';
import { C, serif } from '../theme';
import { randomUUID } from 'expo-crypto';
import { Action, Field, ui } from './ui';
import { answerRiddle, claimDailyReward, startRiddle, type Account, type DailyReward, type RiddleRound } from './api';

export const rewardLabel = (reward: DailyReward) => ({ pigeon: '1 free pigeon delivery', postman: '1 free postman delivery', points: `${reward.amount} postage points`, riddle: '1 riddle token' })[reward.kind];
export function DailyRewardCard({ account, onOpen }: { account: Account; onOpen: () => void }) {
  const today = account.rewards?.today;
  return <Pressable accessibilityRole="button" onPress={onOpen} style={s.card}><View style={s.mark}><Icon name={today ? 'check' : 'spark'} color={C.rust} size={24} /></View><View style={{ flex: 1, gap: 5 }}><Text style={s.title}>{today ? 'Your little gift, collected.' : 'A little gift for today.'}</Text><Text style={ui.small}>{today ? rewardLabel(today) : 'Open your free daily surprise.'}</Text></View><Icon name="chevron" size={17} /></Pressable>;
}
export function RewardsPanel({ account, onRefresh }: { account: Account; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState('');
  const [round, setRound] = useState<RiddleRound | null>(account.rewards?.round ?? null);
  const working = useRef(false);
  const requestId = useRef(randomUUID());
  useEffect(() => { if (account.rewards?.round) setRound(account.rewards.round); }, [account.rewards?.round]);
  async function run(work: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); setMessage('');
    try { await work(); await onRefresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { working.current = false; setBusy(false); }
  }
  const rewards = account.rewards;
  const active = round && !round.solved && round.attempts < 3 && Date.parse(round.expires_at) > Date.now();
  return <View style={{ gap: 20 }}>
    <View><Text style={ui.title}>Your daily surprise.</Text><Text style={ui.body}>A small reason to stop by. Free, once a day.</Text></View>
    <View style={ui.card}><Text style={s.title}>{rewards?.today ? rewardLabel(rewards.today) : 'What’s inside today?'}</Text><Text style={ui.body}>One pigeon delivery, one postman delivery, 10 points, or one riddle token. Each has a 25% chance.</Text><Action title={busy ? 'Opening…' : rewards?.today ? 'Collected for today' : 'Open my daily gift'} disabled={busy || !!rewards?.today} onPress={() => run(async () => { const result = await claimDailyReward(); setMessage(`You received ${rewardLabel(result)}.`); })} /><Text style={ui.small}>Resets at 00:00 UTC{rewards?.next_claim_at ? ` · next gift ${new Date(rewards.next_claim_at).toLocaleString()}` : ''}. Gifts never require a purchase.</Text></View>
    <Text style={s.title}>Your postage pouch</Text>
    <View style={s.inventory}>{[[`${account.points}`, 'points'], [`${rewards?.pigeon ?? 0}`, 'pigeons'], [`${rewards?.postman ?? 0}`, 'postmen'], [`${rewards?.riddle ?? 0}`, 'riddle tokens']].map(([count, label]) => <View key={label} style={s.balance}><Text style={s.number}>{count}</Text><Text style={ui.small}>{label}</Text></View>)}</View>
    <Text style={ui.small}>Free courier deliveries are used automatically before points. Your usual letter limits still apply.</Text>
    <View style={ui.card}><Text style={s.title}>A riddle for the road</Text><Text style={ui.body}>Use one token. Solve the riddle in three guesses to earn 20 points. You have seven days to finish it.</Text>
      {active ? <><Text style={s.question}>{round.question}</Text><Text style={ui.small}>{3 - round.attempts} guesses left · expires {new Date(round.expires_at).toLocaleDateString()}</Text><Field label="Your answer" value={answer} onChange={setAnswer} maxLength={80} autoCapitalize="none" /><Action title={busy ? 'Checking…' : 'Check my answer'} disabled={busy || !answer.trim()} onPress={() => run(async () => { const result = await answerRiddle(round.id, answer); setRound(result); setAnswer(''); setMessage(result.solved ? 'You solved it! 20 points added to your pouch.' : result.attempts >= 3 ? 'This riddle is finished. Try another when you have a token.' : 'Not quite. Give it another thought. Repeated answers do not use another guess.'); })} /></> : <Action title={busy ? 'Opening…' : 'Use a token · open riddle'} disabled={busy || !(rewards?.riddle)} onPress={() => run(async () => { const result = await startRiddle(requestId.current); setRound(result); requestId.current = randomUUID(); setAnswer(''); })} />}
    </View>
    {!!message && <Text accessibilityRole="alert" style={ui.notice}>{message}</Text>}{!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
  </View>;
}
const s = StyleSheet.create({ card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 16, backgroundColor: '#F1EBDD' }, mark: { width: 43, height: 43, borderRadius: 22, backgroundColor: '#FAF6ED', alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: C.ink }, inventory: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, balance: { minWidth: '43%', flexGrow: 1, backgroundColor: C.light, borderRadius: 12, padding: 16, gap: 5 }, number: { fontSize: 27, fontFamily: serif, color: C.green }, question: { fontSize: 24, lineHeight: 32, fontFamily: serif, color: C.ink, paddingVertical: 12 } });
