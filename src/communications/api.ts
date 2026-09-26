import { supabase } from '../backend/client';
export type ChatActivity = { user_id: string; typing_until: string; read_at: string };
export type Attachment = { id: string; message_id: string; conversation_id: string; path: string; name: string; mime: string; bytes: number };
export type Call = { id: string; conversation_id: string; caller_id: string; callee_id: string; kind: 'voice' | 'video'; status: 'ringing' | 'accepted' | 'declined' | 'ended' | 'missed'; expires_at: string; created_at: string; answered_at: string | null; ended_at: string | null };
export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
 if (!supabase) throw Error('Sign in first.');
 const { data, error } = await supabase.rpc(name, args); if (error) throw Error(error.message); return data as T;
}
export async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
 if (!supabase) throw Error('Sign in first.');
 const { data, error } = await supabase.functions.invoke(name, { body });
 if (error) { let message=error.message; try { message=(await error.context.json()).error||message; } catch {} throw Error(message); }
 if(data?.error)throw Error(data.error);return data as T;
}
export const typing = (conversation: string, active: boolean) => rpc<void>('set_chat_typing',{p_conversation:conversation,p_typing:active});
export const readThrough = (conversation: string, message: string) => rpc<void>('mark_chat_read',{p_conversation:conversation,p_message:message});
export const startCall = (conversation: string, kind: Call['kind'], clientId: string) => rpc<Call>('start_call',{p_conversation:conversation,p_kind:kind,p_client:clientId});
export const answerCall = (call: string, accept: boolean) => rpc<Call>('answer_call',{p_call:call,p_accept:accept});
export const endCall = async (call: string) => {
 // End authorization immediately even if the media service is temporarily down.
 await rpc('end_call',{p_call:call});
 await invoke('call-session',{action:'end',callId:call}).catch(()=>{});
};

export type MessageReceipt = { message_id: string; delivered_at: string; read_at: string | null };
export const acknowledgeMessages = (ids: string[], read = false) => rpc<void>('acknowledge_messages', { p_messages: ids, p_read: read });
export async function loadReceipts(ids: string[]): Promise<MessageReceipt[]> {
 const batches: string[][] = []; for(let i=0;i<ids.length;i+=100)batches.push(ids.slice(i,i+100));
 const rows = await Promise.all(batches.map(async batch => { const {data,error}=await supabase!.from('message_receipts').select('message_id,delivered_at,read_at').in('message_id',batch); if(error)throw Error(error.message);return data||[]; }));return rows.flat();
}
