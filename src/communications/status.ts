export function messageStatus(receipt: { delivered_at: string; read_at: string | null } | undefined, legacyRead = false) {
 if (receipt?.read_at || legacyRead) return '✓✓ Read';
 return receipt?.delivered_at ? '✓✓ Delivered' : '✓ Sent';
}
export function callDescription(call: {caller_id:string;status:string;answered_at:string|null;ended_at:string|null;expires_at:string}, userId:string, now=Date.now()) {
 const direction = call.caller_id === userId ? 'Outgoing' : 'Incoming';
 if (call.answered_at) {
  const start = Date.parse(call.answered_at);
  const end = Math.min(call.ended_at ? Date.parse(call.ended_at) : now, Date.parse(call.expires_at));
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  return `${direction} · ${call.status === 'accepted' && Date.parse(call.expires_at) > now ? 'In progress' : 'Answered'} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
 }
 const status = call.status === 'declined' ? 'Declined' : call.status === 'ringing' && Date.parse(call.expires_at) > now ? 'Ringing' : call.status === 'ended' ? (call.caller_id === userId ? 'Cancelled' : 'Missed') : 'Missed';
 return `${direction} · ${status}`;
}
