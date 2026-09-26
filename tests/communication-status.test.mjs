import test from 'node:test';
import assert from 'node:assert/strict';
import { messageStatus,callDescription } from '../src/communications/status.ts';
test('ticks distinguish server acceptance, recipient delivery and reading',()=>{
 assert.equal(messageStatus(undefined),'✓ Sent');
 assert.equal(messageStatus({delivered_at:'2026-09-26',read_at:null}),'✓✓ Delivered');
 assert.equal(messageStatus({delivered_at:'2026-09-26',read_at:'2026-09-26'}),'✓✓ Read');
 assert.equal(messageStatus(undefined,true),'✓✓ Read');
});
test('call history classifies unaccepted calls and derives bounded answered duration',()=>{
 const call={caller_id:'a',status:'ended',answered_at:null,ended_at:null,expires_at:'2026-09-26T12:00:00Z'};
 assert.equal(callDescription(call,'a'),'Outgoing · Cancelled');
 assert.equal(callDescription(call,'b'),'Incoming · Missed');
 assert.equal(callDescription({...call,status:'declined'},'b'),'Incoming · Declined');
 assert.equal(callDescription({...call,status:'ringing'},'b',Date.parse('2026-09-26T12:01:00Z')),'Incoming · Missed');
 assert.equal(callDescription({...call,answered_at:'2026-09-26T11:55:00Z',ended_at:'2026-09-26T11:56:07Z'},'a'),'Outgoing · Answered · 1:07');
});
