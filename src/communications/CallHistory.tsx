import React, { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { supabase } from '../backend/client';
import { Action, ui } from '../backend/ui';
import type { Call } from './api';
import { callDescription } from './status';
export function CallHistory({ userId, conversationId, personName, onOpen, allowedConversations }: { userId: string; conversationId?: string; allowedConversations?: string[]; personName: (id: string) => string; onOpen?: (conversation: string) => void }) {
 const [calls, setCalls] = useState<Call[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true), [more, setMore] = useState(false), [paging, setPaging] = useState(false);
 const alive = useRef(true), initialized = useRef(false), pagingRef = useRef(false), generation = useRef(0);
 const query = () => { let q = supabase!.from('calls').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(30); return conversationId ? q.eq('conversation_id', conversationId) : q; };
 useEffect(() => {
  alive.current = true; initialized.current = false; const scope = ++generation.current; let sequence = 0;
  setCalls([]); setLoading(true);
  const load = async () => {
   if (AppState.currentState !== 'active') return;
   const version = ++sequence; const { data, error } = await query();
   if (!alive.current || scope !== generation.current || version !== sequence) return;
   setLoading(false); setError(error?.message || '');
   if (error) { setCalls([]); initialized.current = false; return; }
   const rows = (data || []) as Call[];
   setCalls(old => { const boundary = rows.at(-1); return [...rows, ...old.filter(c => boundary && (c.created_at < boundary.created_at || (c.created_at === boundary.created_at && c.id < boundary.id)))]; });
   if (!initialized.current) { setMore(rows.length === 30); initialized.current = true; }
  };
  void load(); const timer = setInterval(() => void load(), 10000);
  const channel = supabase!.channel(`history-${userId}-${conversationId || 'all'}`).on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => void load()).subscribe();
  return () => { alive.current = false; ++generation.current; clearInterval(timer); void supabase!.removeChannel(channel); };
 }, [userId, conversationId]);
 async function earlier() {
  const last = calls.at(-1); if (!last || pagingRef.current) return;
  pagingRef.current = true; setPaging(true); const scope = generation.current;
  try {
   const { data, error } = await query().or(`created_at.lt.${last.created_at},and(created_at.eq.${last.created_at},id.lt.${last.id})`);
   if (error) throw error;
   if (!alive.current || scope !== generation.current) return;
   const rows = (data || []) as Call[]; setCalls(old => [...old, ...rows.filter(c => !old.some(o => o.id === c.id))]); setMore(rows.length === 30); setError('');
  } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Could not load earlier calls.'); }
  finally { pagingRef.current = false; if (alive.current) setPaging(false); }
 }
 const visibleCalls=allowedConversations?calls.filter(c=>allowedConversations.includes(c.conversation_id)):calls;
 return <View style={{ gap: 14 }}>
  <Text style={ui.label}>Call history</Text>
  {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
  {!visibleCalls.length && <Text style={ui.body}>{loading ? 'Loading calls…' : error ? 'Call history could not be loaded.' : 'No calls yet.'}</Text>}
  {visibleCalls.map(call => <View key={call.id} style={[ui.card, { gap: 8 }]}>
   <Text style={ui.label}>{personName(call.caller_id === userId ? call.callee_id : call.caller_id)} · {call.kind === 'video' ? 'Video' : 'Voice'}</Text>
   <Text style={ui.body}>{callDescription(call, userId)}</Text>
   <Text style={ui.small}>{new Date(call.created_at).toLocaleString()}</Text>
   {onOpen && <Action title="Open conversation" secondary onPress={() => onOpen(call.conversation_id)} />}
  </View>)}
  {more && <Action title={paging ? 'Loading…' : 'Earlier calls'} secondary disabled={paging} onPress={() => void earlier()} />}
 </View>;
}
