import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, serif } from '../theme';

export function Action({ title, onPress, disabled, secondary }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[ui.action, secondary && ui.secondary, disabled && { opacity: .45 }]}><Text style={[ui.actionText, secondary && { color: C.green }]}>{title}</Text></Pressable>;
}
export function Field({ label, value, onChange, ...props }: { label: string; value: string; onChange: (v: string) => void } & Omit<React.ComponentProps<typeof TextInput>, 'value' | 'onChangeText' | 'onChange'>) {
  return <View style={{ gap: 8 }}><Text style={ui.label}>{label}</Text><TextInput accessibilityLabel={label} style={ui.input} value={value} onChangeText={onChange} placeholderTextColor={C.muted} {...props} /></View>;
}
export const ui = StyleSheet.create({
  form: { width: '100%', maxWidth: 470, padding: 24, gap: 18, alignSelf: 'center' },
  title: { fontFamily: serif, fontSize: 31, lineHeight: 39, color: C.ink },
  body: { color: C.muted, fontSize: 14, lineHeight: 23 },
  small: { color: C.muted, fontSize: 12, lineHeight: 19 },
  label: { color: C.ink, fontSize: 12, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#D8DFD0', borderRadius: 9, backgroundColor: '#FFF', padding: 14, minHeight: 48, color: C.ink, fontSize: 15, lineHeight: 23 },
  action: { maxWidth: '100%', backgroundColor: C.green, minHeight: 48, padding: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#CAD6C2' },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  error: { color: '#934F40', fontSize: 13, lineHeight: 20 },
  notice: { color: C.green, fontSize: 13, lineHeight: 20 },
  card: { backgroundColor: '#FDFCF7', borderWidth: 1, borderColor: C.line, padding: 18, borderRadius: 13, gap: 12 },
});
