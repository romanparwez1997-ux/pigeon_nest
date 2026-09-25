import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { PigeonArt } from '../components/Artwork';
import { supabase } from './client';
import { Action, Field, ui } from './ui';

type Mode = 'signin' | 'signup' | 'recover' | 'verify' | 'password';
export function AuthScreen({ onRecovery }: { onRecovery: (active: boolean) => void }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const working = useRef(false);
  async function run(work: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { working.current = false; setBusy(false); }
  }
  function navigate(next: Mode) {
    setMode(next); setPassword(''); setConfirm(''); setToken(''); setError(''); setNotice('');
    onRecovery(next === 'recover' || next === 'verify' || next === 'password');
  }
  async function submit() {
    if (!supabase) throw new Error('Backend configuration is missing.');
    if (mode === 'recover') {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
      setMode('verify'); setNotice('If this address has an account, a recovery code is on its way. Enter it below.');
    } else if (mode === 'verify') {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'recovery' });
      if (error) throw error;
      setToken(''); setMode('password');
    } else if (mode === 'password') {
      if (password.length < 8 || password !== confirm) throw new Error('Use at least 8 characters and matching passwords.');
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // Revoke other sessions, then require a normal sign-in with the new password.
      const { error: signoutError } = await supabase.auth.signOut();
      if (signoutError) throw signoutError;
      navigate('signin'); setNotice('Password updated. Sign in with your new password.');
    } else {
      const result = mode === 'signup'
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      setPassword('');
      if (mode === 'signup' && !result.data.session) {
        setMode('signin'); setNotice('Confirm your email, then return here and sign in.');
      }
    }
  }
  const needsPassword = mode === 'signin' || mode === 'signup' || mode === 'password';
  const title = { signin: 'Welcome back, explorer.', signup: 'Start a real connection.', recover: 'Recover your passport.', verify: 'Check your email.', password: 'Choose a new password.' }[mode];
  const button = { signin: 'Sign in', signup: 'Create account', recover: 'Send recovery code', verify: 'Verify recovery code', password: 'Save new password' }[mode];
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}><View style={ui.form}>
    <PigeonArt size={150} /><Text style={ui.title}>{title}</Text>
    <Text style={ui.body}>Your letters and conversations stay with your account across devices.</Text>
    {mode !== 'password' && <Field label="Email" value={email} onChange={setEmail} editable={!busy && mode !== 'verify'} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />}
    {needsPassword && <Field label={mode === 'password' ? 'New password' : 'Password'} value={password} onChange={setPassword} editable={!busy} secureTextEntry autoCapitalize="none" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />}
    {mode === 'password' && <Field label="Confirm new password" value={confirm} onChange={setConfirm} editable={!busy} secureTextEntry autoCapitalize="none" autoComplete="new-password" />}
    {mode === 'verify' && <Field label="Recovery code" value={token} onChange={setToken} editable={!busy} keyboardType="number-pad" autoComplete="one-time-code" maxLength={10} />}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    {!!notice && <Text accessibilityRole="alert" style={ui.notice}>{notice}</Text>}
    <Action title={busy ? 'Please wait…' : button} disabled={busy || (mode !== 'password' && !email.trim()) || (needsPassword && password.length < (mode === 'signin' ? 1 : 8)) || (mode === 'verify' && token.trim().length < 6) || (mode === 'password' && password !== confirm)} onPress={() => run(submit)} />
    {(mode === 'signin' || mode === 'signup') && <>
      <Action title={mode === 'signin' ? 'Create an account' : 'Back to sign in'} secondary disabled={busy} onPress={() => navigate(mode === 'signin' ? 'signup' : 'signin')} />
      <Action title="Forgot password?" secondary disabled={busy} onPress={() => navigate('recover')} />
      <Action title="Resend confirmation email" secondary disabled={busy || !email.trim()} onPress={() => run(async () => {
        const { error } = await supabase!.auth.resend({ type: 'signup', email: email.trim() });
        if (error) throw error;
        setNotice('If confirmation is needed, check your email for a new link.');
      })} />
    </>}
    {(mode === 'recover' || mode === 'verify' || mode === 'password') && <Action title="Back to sign in" secondary disabled={busy} onPress={() => run(async () => {
      if (mode === 'password') { const { error } = await supabase!.auth.signOut({ scope: 'local' }); if (error) throw error; }
      navigate('signin');
    })} />}
    <Text style={ui.small}>New passwords need at least 8 characters. Email confirmation is required.</Text>
  </View></ScrollView></KeyboardAvoidingView>;
}
