import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { candidates, COUNTRIES, Destination, Person, PostState } from '../domain/model';
import { C, serif } from '../theme';
import { Icon, PigeonArt } from '../components/Artwork';
import type { GameChoice } from './GamesScreen';

type Props = { state: PostState; discoveryPeople?: Person[]; onWrite: (destination?: Destination, prompt?: string) => void; onPlay: (game: GameChoice) => void; onTranslate: () => void; onMailbox: () => void; onLetter: (id: string) => void; onPassport: () => void; rewards?: React.ReactNode; onPremium?: () => void };
export function ExploreScreen({ state, discoveryPeople, onWrite, onTranslate, onMailbox, onPassport, rewards, onPremium }: Props) {
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const wide = width >= 680;
  const [browsing, setBrowsing] = useState(false);
  const [country, setCountry] = useState<string | null>(null);
  const [limit, setLimit] = useState(6);
  const people = discoveryPeople ?? candidates(state);
  const places = [...new Set(people.map(p => p.country))].sort();
  const filtered = people.filter(p => !country || p.country === country);
  const inbox = state.letters.filter(l => l.direction === 'incoming' && l.status === 'arrived').length;
  const flying = state.letters.filter(l => l.direction === 'outgoing' && l.status === 'traveling').length;
  return <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={s.home}>
    <View><Text style={s.kicker}>A LITTLE SPACE TO CONNECT</Text><Text style={s.title}>{state.profile ? `Hello, ${state.profile.name}.` : 'A friendship starts here.'}</Text><Text style={s.body}>Take your time. Send a little of your world.</Text></View>
    <View style={s.hero}>
      <View style={{ flex: 1, gap: 14 }}><Text style={s.heroTitle}>A little hello.{ '\n' }A new friend.</Text><Text style={s.body}>Someone out there would love to hear from you.</Text><Pressable accessibilityRole="button" onPress={() => onWrite()} style={s.primary}><Text style={s.primaryText}>Write a letter</Text><Icon name="send" size={18} color="#fff" /></Pressable></View>
      {width / fontScale >= 350 && <View style={{ alignSelf: 'center' }}><PigeonArt size={wide ? 180 : 90} /></View>}
    </View>
    <Pressable accessibilityRole="button" onPress={onMailbox} style={s.mailbox}><Icon name="mail" size={24} /><View style={{ flex: 1, gap: 4 }}><Text style={s.heading}>{inbox ? `${inbox} ${inbox === 1 ? 'letter' : 'letters'} waiting for you` : 'Your mailbox'}</Text><Text style={s.small}>{flying ? `${flying} ${flying === 1 ? 'letter is' : 'letters are'} on the way` : 'Your next hello will arrive here.'}</Text></View><Icon name="chevron" size={17} /></Pressable>
    {rewards}
    <View style={s.discovery}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: browsing }} onPress={() => { setBrowsing(v => !v); setLimit(6); }} style={s.discoveryHeader}><View style={{ flex: 1, gap: 6 }}><Text style={s.sectionTitle}>Find a pen pal</Text><Text style={s.small}>A shared interest. A different corner of the world.</Text></View><Icon name={browsing ? 'close' : 'arrow'} size={22} /></Pressable>
      {browsing && <View style={{ gap: 18 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[null, ...places].map(c => <Pressable key={c || 'all'} accessibilityRole="button" accessibilityState={{ selected: country === c }} onPress={() => { setCountry(c); setLimit(6); }} style={[s.chip, country === c && s.selected]}><Text style={{ color: country === c ? '#fff' : C.green, fontSize: 12 }}>{c || 'Anywhere'}</Text></Pressable>)}
        </ScrollView>
        {!state.profile ? <Pressable accessibilityRole="button" onPress={onPassport} style={s.empty}><Text style={s.body}>Create your passport to meet your circle.</Text><Text style={s.link}>Create passport →</Text></Pressable> : !filtered.length ? <View style={s.empty}><Text style={s.heading}>A quiet corner, for now.</Text><Text style={s.body}>More explorers will appear as they join your friendship circle.</Text></View> : <View style={{ gap: 12 }}>{filtered.slice(0, limit).map(p => <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Write to ${p.name}`} onPress={() => onWrite({ kind: 'person', personId: p.id })} style={s.person}><View style={[s.avatar, { backgroundColor: p.color }]}><Text style={s.initials}>{p.initials}</Text></View><View style={{ flex: 1, gap: 5 }}><Text style={s.heading}>{p.name} <Text style={s.small}>{COUNTRIES.find(c => c.name === p.country)?.flag} {p.country}</Text></Text><Text style={s.small}>{p.interests.slice(0, 3).join(' · ')}</Text></View><Icon name="send" size={18} /></Pressable>)}{filtered.length > limit && <Pressable accessibilityRole="button" onPress={() => setLimit(v => v + 6)} style={s.chip}><Text style={s.link}>Meet more explorers</Text></Pressable>}</View>}
      </View>}
    </View>
    <View style={s.utilities}><Pressable accessibilityRole="button" onPress={onTranslate} style={s.utility}><Icon name="translate" size={18} /><Text style={s.link}>Translate</Text></Pressable>{onPremium && <Pressable accessibilityRole="button" onPress={onPremium} style={s.utility}><Icon name="spark" size={18} color={C.rust} /><Text style={s.link}>Pigeon Plus</Text></Pressable>}</View>
  </View>;
}
const s = StyleSheet.create({
  home: { gap: 24, maxWidth: 820, width: '100%', alignSelf: 'center' },
  kicker: { color: C.rust, fontSize: 9, letterSpacing: 1.6, fontWeight: '700', marginBottom: 10 },
  title: { color: C.ink, fontFamily: serif, fontSize: 33, lineHeight: 41, marginBottom: 8 },
  body: { color: C.muted, fontSize: 14, lineHeight: 22 }, small: { color: C.muted, fontSize: 12, lineHeight: 19 },
  hero: { flexDirection: 'row', gap: 12, backgroundColor: '#E9EEDF', borderRadius: 20, padding: 24 },
  heroTitle: { fontFamily: serif, fontSize: 29, lineHeight: 35, color: C.ink },
  primary: { backgroundColor: C.green, paddingHorizontal: 18, minHeight: 48, paddingVertical: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, alignSelf: 'flex-start' },
  primaryText: { flexShrink: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  mailbox: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 9 },
  heading: { color: C.ink, fontSize: 15, fontWeight: '600' }, sectionTitle: { color: C.ink, fontFamily: serif, fontSize: 24 },
  discovery: { gap: 22, borderTopWidth: 1, borderColor: C.line, paddingTop: 24 }, discoveryHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  chip: { paddingHorizontal: 14, paddingVertical: 13, borderRadius: 22, backgroundColor: C.light, alignSelf: 'flex-start' }, selected: { backgroundColor: C.green },
  empty: { paddingVertical: 12, gap: 10 }, person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderColor: C.line },
  avatar: { width: 44, height: 44, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, initials: { fontFamily: serif, fontSize: 18, color: C.green },
  utilities: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', borderTopWidth: 1, borderColor: C.line, paddingTop: 8 }, utility: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 48, paddingHorizontal: 4 }, link: { color: C.green, fontSize: 12, fontWeight: '600' },
});
