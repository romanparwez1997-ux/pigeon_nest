import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, serif } from '../theme';
import { Icon } from '../components/Artwork';
import { GameStats } from '../domain/model';
import { botMove, Mark, shuffledStamps, winner } from '../domain/games';

export type GameChoice = 'memory' | 'tic' | null;
export type GameResult = { kind: 'memory'; moves: number } | { kind: 'tic'; won: boolean };
type RecordGame = (result: GameResult) => void;
function Action({ title, onPress }: { title: string; onPress: () => void }) { return <Pressable accessibilityRole="button" onPress={onPress} style={s.action}><Text style={s.actionText}>{title}</Text><Icon name="arrow" color="white" size={18} /></Pressable>; }

function TicTacToe({ onRecord }: { onRecord: RecordGame }) {
  const [board, setBoard] = useState<Mark[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<'you' | 'pip'>('you');
  const recorded = useRef(false);
  const record = useRef(onRecord); record.current = onRecord;
  const result = winner(board);
  useEffect(() => {
    if (result) { if (!recorded.current) { recorded.current = true; record.current({ kind: 'tic', won: result === 'X' }); } return; }
    if (turn !== 'pip') return;
    const timer = setTimeout(() => { const move = botMove(board); if (move !== null) setBoard(b => b.map((v, i) => i === move ? 'O' : v)); setTurn('you'); }, 650);
    return () => clearTimeout(timer);
  }, [board, turn, result]);
  const reset = () => { recorded.current = false; setBoard(Array(9).fill(null)); setTurn('you'); };
  return <View style={s.game}><View style={s.gameTop}><Text style={s.pill}>YOU  ✕</Text><Text style={s.vs}>vs.</Text><Text style={[s.pill, { backgroundColor: '#F5DFC7' }]}>PIP  ○</Text></View><Text accessibilityLiveRegion="polite" style={s.status}>{result === 'X' ? 'You outsmarted the pigeon! ✨' : result === 'O' ? 'Pip wins this round. Rematch?' : result === 'draw' ? 'Great minds think alike. A draw!' : turn === 'you' ? 'Your turn. Pick a little square.' : 'Pip is having a little think…'}</Text><View style={s.board}>{board.map((mark, i) => <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Square ${i + 1}${mark ? `, ${mark}` : ', empty'}`} disabled={!!mark || !!result || turn === 'pip'} onPress={() => { setBoard(b => b.map((v, j) => j === i ? 'X' : v)); setTurn('pip'); }} style={[s.square, mark === 'X' && { backgroundColor: '#DCE9DE' }, mark === 'O' && { backgroundColor: '#FAE4D0' }]}><Text adjustsFontSizeToFit numberOfLines={1} style={[s.mark, { color: mark === 'X' ? C.green : '#B77344' }]}>{mark === 'X' ? '×' : mark === 'O' ? '○' : ''}</Text></Pressable>)}</View><Text style={s.note}>A friendly solo match against Pip, your courier bot.</Text><Action title={result ? 'Play again' : 'Restart round'} onPress={reset} /></View>;
}

function StampMatch({ onRecord }: { onRecord: RecordGame }) {
  const [deck, setDeck] = useState(() => shuffledStamps());
  const [opened, setOpened] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const recorded = useRef(false);
  const record = useRef(onRecord); record.current = onRecord;
  useEffect(() => {
    if (opened.length !== 2) return;
    const [a,b] = opened;
    const timer = setTimeout(() => { if (deck[a] === deck[b]) setMatched(m => [...m, a, b]); setOpened([]); }, deck[a] === deck[b] ? 350 : 850);
    return () => clearTimeout(timer);
  }, [opened, deck]);
  const complete = matched.length === deck.length;
  useEffect(() => { if (complete && !recorded.current) { recorded.current = true; record.current({ kind: 'memory', moves }); } }, [complete, moves]);
  const reset = () => { recorded.current = false; setOpened([]); setMatched([]); setMoves(0); setDeck(shuffledStamps()); };
  return <View style={s.game}><View style={s.gameTop}><Text style={s.pill}>{matched.length / 2} / 6 PAIRS</Text><Text style={[s.pill, { backgroundColor: '#F5DFC7' }]}>{moves} MOVES</Text></View><Text accessibilityLiveRegion="polite" style={s.status}>{complete ? 'A passport full of perfect pairs! ✨' : 'Flip two stamps. Find their travelling twins.'}</Text><View style={s.memoryBoard}>{deck.map((flag, i) => { const revealed = opened.includes(i) || matched.includes(i); return <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Stamp ${i + 1}${revealed ? `, ${flag}` : ', face down'}${matched.includes(i) ? ', matched' : ''}`} disabled={revealed || opened.length === 2} onPress={() => { if (opened.length === 1) setMoves(m => m + 1); setOpened(v => [...v, i]); }} style={[s.stamp, revealed && { backgroundColor: '#FBF7EA', borderColor: '#C9D4B4' }, matched.includes(i) && { backgroundColor: '#E1EDDC' }]}>{revealed ? <Text style={{ fontSize: 35 }}>{flag}</Text> : <><Icon name="bird" size={28} color="#F2F0D9" /><Text style={s.stampBack}>AIR MAIL</Text></>}</Pressable>; })}</View><Text style={s.note}>Six countries. Twelve stamps. How good is your memory?</Text><Action title={complete ? 'Shuffle & play again' : 'Shuffle a new deck'} onPress={reset} /></View>;
}

export function GamesScreen({ selected, onSelect, stats, onRecord }: { selected: GameChoice; onSelect: (game: GameChoice) => void; stats?: GameStats; onRecord: RecordGame }) {
  return <View style={{ gap: 22 }}><View><Text style={s.eyebrow}>A LITTLE PLAY GOES A LONG WAY</Text><Text style={s.title}>The layover lounge.</Text><Text style={s.body}>Your letters are travelling. You’ve got time for a little fun.</Text></View><View style={s.scorebar}><Icon name="game" /><Text style={s.scoreText}>{stats?.rounds || 0} rounds played</Text><Text style={s.scoreText}>{stats?.ticWins || 0} wins against Pip</Text>{!!stats?.memoryBest && <Text style={s.scoreText}>Best match: {stats.memoryBest} moves</Text>}</View>{selected ? <><Pressable accessibilityRole="button" onPress={() => onSelect(null)} style={s.back}><Icon name="back" size={18} /><Text style={s.backText}>Back to the lounge</Text></Pressable><View style={s.gameCard}><Text style={s.gameTitle}>{selected === 'memory' ? 'Stamp Match' : 'Three in a row'}</Text>{selected === 'memory' ? <StampMatch onRecord={onRecord} /> : <TicTacToe onRecord={onRecord} />}</View></> : <View style={s.cards}><Pressable accessibilityRole="button" accessibilityLabel="Play Stamp Match" onPress={() => onSelect('memory')} style={[s.pickCard, { backgroundColor: '#E6EBDD' }]}><View style={s.miniStamps}><Text style={s.miniStamp}>🇯🇵</Text><Text style={[s.miniStamp, { transform: [{ rotate: '12deg' }], backgroundColor: '#E3D8ED' }]}>?</Text><Text style={[s.miniStamp, { transform: [{ rotate: '-9deg' }] }]}>🇯🇵</Text></View><Text style={s.gameTitle}>Stamp Match</Text><Text style={s.body}>A tiny trip around the world. Find six pairs of country stamps.</Text><View style={s.pickFooter}><Text style={s.backText}>SOLO · MEMORY</Text><Icon name="arrow" /></View></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Play Three in a row" onPress={() => onSelect('tic')} style={[s.pickCard, { backgroundColor: '#F4E5D8' }]}><Text style={s.xoArt}>✕ ○ ✕</Text><Text style={s.gameTitle}>Three in a row</Text><Text style={s.body}>Meet Pip. Excellent at delivering letters. Surprisingly good at games.</Text><View style={s.pickFooter}><Text style={s.backText}>VS. PIP · STRATEGY</Text><Icon name="arrow" /></View></Pressable></View>}<Text style={s.note}>Play for the fun of it. Scores stay on this device. Online games with friends come later.</Text></View>;
}
const s = StyleSheet.create({
  eyebrow: { color: C.rust, fontSize: 9, fontWeight: '700', letterSpacing: 1.8, marginBottom: 12 }, title: { fontFamily: serif, fontSize: 36, color: C.ink, marginBottom: 10 }, body: { fontSize: 14, lineHeight: 22, color: C.muted }, scorebar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 15, padding: 17, borderRadius: 12, backgroundColor: '#EEEFE5' }, scoreText: { fontSize: 12, color: C.green }, cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 }, pickCard: { minWidth: 0, flexBasis: 280, flexGrow: 1, flexShrink: 1, borderRadius: 20, padding: 26, gap: 17 }, miniStamps: { flexDirection: 'row', justifyContent: 'center', marginVertical: 15 }, miniStamp: { flexShrink: 1, padding: 10, fontSize: 30, backgroundColor: '#FFF9EA', borderWidth: 2, borderStyle: 'dashed', borderColor: '#C1CBAA', transform: [{ rotate: '-12deg' }], borderRadius: 4, color: C.green }, xoArt: { fontSize: 55, fontFamily: serif, textAlign: 'center', color: '#AD764D', marginVertical: 18 }, gameTitle: { fontFamily: serif, fontSize: 28, color: C.ink }, pickFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }, back: { flexDirection: 'row', gap: 8, alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 10 }, backText: { fontSize: 11, fontWeight: '600', color: C.green, letterSpacing: .6 }, gameCard: { borderWidth: 1, borderColor: C.line, backgroundColor: '#FDFCF7', padding: 22, borderRadius: 20, alignItems: 'center' }, game: { width: '100%', maxWidth: 390, alignItems: 'center', gap: 22, marginTop: 20 }, gameTop: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center', alignItems: 'center' }, pill: { fontSize: 11, color: C.green, backgroundColor: '#DFE7D7', paddingHorizontal: 15, paddingVertical: 9, borderRadius: 20, fontWeight: '700' }, vs: { fontFamily: serif, fontStyle: 'italic', color: C.muted }, status: { fontSize: 13, color: C.ink, textAlign: 'center', lineHeight: 20 }, board: { maxWidth: 320, width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, square: { width: '30%', flexGrow: 1, aspectRatio: 1, borderRadius: 13, backgroundColor: '#F0EFE5', alignItems: 'center', justifyContent: 'center' }, mark: { fontSize: 58, lineHeight: 68 }, memoryBoard: { width: '100%', maxWidth: 330, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, stamp: { width: '30%', flexGrow: 1, aspectRatio: .94, borderWidth: 2, borderStyle: 'dashed', borderColor: '#8DA08B', borderRadius: 9, backgroundColor: '#557661', alignItems: 'center', justifyContent: 'center', gap: 7 }, stampBack: { fontSize: 7, letterSpacing: 1.5, color: '#DDE2C8' }, action: { backgroundColor: C.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 24, paddingVertical: 15, borderRadius: 10 }, actionText: { flexShrink: 1, color: 'white', fontSize: 13, fontWeight: '600' }, note: { fontSize: 11, lineHeight: 18, color: C.muted, textAlign: 'center' },
});
