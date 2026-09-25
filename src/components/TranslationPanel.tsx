import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, serif } from '../theme';
import { Icon } from './Artwork';
import { Language, LANGUAGES, translateText } from '../services/translation';

export function TranslationPanel({ initialText }: { initialText: string }) {
  const [text, setText] = useState(initialText);
  const [from, setFrom] = useState<Language>('en');
  const [to, setTo] = useState<Language>('hi');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const current = useRef<AbortController | null>(null);
  useEffect(() => () => { current.current?.abort(); }, []);
  const clear = () => { current.current?.abort(); current.current = null; setBusy(false); setResult(''); setError(''); };
  const translate = async () => {
    current.current?.abort();
    const controller = new AbortController(); current.current = controller;
    setBusy(true); setError(''); setResult('');
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const output = await translateText(text, from, to, controller.signal);
      if (current.current === controller) setResult(output);
    } catch (e) {
      if (current.current === controller) setError(controller.signal.aborted ? 'Translation took too long. Check your connection and try again.' : e instanceof TypeError ? 'Couldn’t reach the translator. Check your internet connection and retry.' : e instanceof Error ? e.message : 'Translation failed. Please try again.');
    } finally { clearTimeout(timeout); if (current.current === controller) { setBusy(false); current.current = null; } }
  };
  const picker = (label: string, value: Language, setter: (v: Language) => void) => <View><Text style={s.label}>{label}</Text><View style={s.chips}>{LANGUAGES.map(l => <Pressable key={l.code} accessibilityRole="radio" accessibilityLabel={`${label}: ${l.label}`} accessibilityState={{ checked: value === l.code }} onPress={() => { clear(); setter(l.code); }} style={[s.chip, value === l.code && s.selected]}><Text style={[s.chipText, value === l.code && { color: 'white' }]}>{l.label}</Text></Pressable>)}</View></View>;
  return <View style={{ gap: 17 }}><Text style={s.eyebrow}>WORDS WITHOUT BORDERS</Text><Text style={s.title}>A little help saying hello.</Text><Text style={s.body}>Read a letter in your language, or find the words for your next hello.</Text>{picker('Original language', from, setFrom)}<TextInput accessibilityLabel="Text to translate" style={s.input} multiline value={text} maxLength={2000} placeholder="Write something to translate…" placeholderTextColor={C.muted} onChangeText={v => { clear(); setText(v); }} />{picker('Translate into', to, setTo)}<View style={s.notice}><Icon name="globe" size={18} /><Text style={[s.body, { flex: 1, fontSize: 12 }]}>When you tap Translate, this text is sent to MyMemory. Translation needs internet and may make mistakes.</Text></View><Pressable accessibilityRole="button" disabled={busy || !text.trim()} onPress={translate} style={[s.button, (busy || !text.trim()) && { opacity: .5 }]}>{busy ? <ActivityIndicator color="white" /> : <Icon name="translate" color="white" size={20} />}<Text style={s.buttonText}>{busy ? 'Finding the words…' : 'Translate'}</Text></Pressable>{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!result && <View style={s.result} accessibilityLiveRegion="polite"><Text style={s.eyebrow}>{LANGUAGES.find(l => l.code === to)?.label.toUpperCase()} · TRANSLATION</Text><Text selectable style={s.translated}>{result}</Text><Text style={s.body}>Your original message stays unchanged.</Text></View>}</View>;
}
const s = StyleSheet.create({
  eyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.8, color: C.rust }, title: { fontFamily: serif, fontSize: 30, color: C.ink, marginTop: -7 }, body: { color: C.muted, fontSize: 13, lineHeight: 20 }, label: { fontSize: 12, fontWeight: '600', color: C.ink, marginBottom: 10 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { backgroundColor: '#EAEDE3', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 10 }, selected: { backgroundColor: C.green }, chipText: { fontSize: 12, color: C.green }, input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 16, minHeight: 112, maxHeight: 200, fontSize: 15, lineHeight: 24, color: C.ink, textAlignVertical: 'top' }, notice: { flexDirection: 'row', alignItems: 'center', gap: 10 }, button: { minHeight: 48, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10, backgroundColor: C.green }, buttonText: { color: '#fff', fontWeight: '600' }, error: { color: '#944F40', padding: 14, backgroundColor: '#F4E2D9', borderRadius: 10, fontSize: 13, lineHeight: 20 }, result: { backgroundColor: '#EAF0DF', borderRadius: 14, padding: 20, gap: 14 }, translated: { fontSize: 18, lineHeight: 30, color: C.ink },
});
