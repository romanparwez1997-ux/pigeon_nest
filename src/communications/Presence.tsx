import React, { useEffect, useState } from 'react';
import { AppState, Platform, Text } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { supabase } from '../backend/client';
import { ui } from '../backend/ui';
import { rpc } from './api';
import type { LiveMessage } from '../backend/api';
const foreground = () => AppState.currentState === 'active' && (Platform.OS !== 'web' || document.visibilityState === 'visible');
export function CommunicationActivity({ userId }: { userId: string }) {
 useEffect(() => {
  const session = randomUUID(); let stopped = false, busy = false, heartbeat = 0;
  const presence = (online: boolean) => rpc('update_presence', { p_session: session, p_online: online });
  const sync = async () => {
   if (stopped || busy || !foreground()) return;
   busy = true;
   try {
    if (Date.now() - heartbeat > 20000) { await presence(true); heartbeat = Date.now(); if(stopped || !foreground()){await presence(false);return;} }
    const messages = await rpc<LiveMessage[]>('pending_message_deliveries');
    if (!stopped && foreground() && messages.length) await rpc('acknowledge_messages', { p_messages: messages.map(m => m.id), p_read: false });
   } catch { /* Polling retries delivery and presence after reconnection. */ }
   finally { busy = false; }
  };
  const changed = () => { if (foreground()) { heartbeat = 0; void sync(); } else { heartbeat = 0; void presence(false).catch(() => {}); } };
  const app = AppState.addEventListener('change', changed);
  if (Platform.OS === 'web') document.addEventListener('visibilitychange', changed);
  const channel = supabase!.channel(`delivery-${userId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => void sync()).subscribe();
  const timer = setInterval(() => void sync(), 10000); void sync();
  return () => { stopped = true; clearInterval(timer); app.remove(); if (Platform.OS === 'web') document.removeEventListener('visibilitychange', changed); void supabase!.removeChannel(channel); void presence(false).catch(() => {}); };
 }, [userId]);
 return null;
}
type Presence = { online: boolean; online_seconds: number; last_seen: string | null };
export function PresenceLabel({ conversationId }: { conversationId: string }) {
 const [state, setState] = useState<{ value: Presence; received: number } | null>(null);
 const [now, setNow] = useState(Date.now());
 useEffect(() => {
  let alive = true;
  const update = async () => { if(!foreground())return; try { const value = await rpc<Presence>('conversation_presence', { p_conversation: conversationId }); if (alive) setState({ value, received: Date.now() }); } catch { if(alive)setState(null); } };
  void update(); const timer = setInterval(() => void update(), 15000); const clock = setInterval(() => setNow(Date.now()), 5000);
  return () => { alive = false; clearInterval(timer); clearInterval(clock); };
 }, [conversationId]);
 const online = state && state.value.online && now - state.received < state.value.online_seconds * 1000;
 const label = !state ? 'Status unavailable' : online ? '● Online' : state.value.last_seen ? `Offline · last seen ${new Date(state.value.last_seen).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'Offline';
 return <Text style={ui.small} accessibilityLabel={label}>{label}</Text>;
}
