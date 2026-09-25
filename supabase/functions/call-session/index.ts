import { AccessToken, RoomServiceClient } from 'npm:livekit-server-sdk@2.15.0';
import { admin, authenticated, cors, json, uuid } from '../_shared/communication.ts';
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 let auth;try{auth=await authenticated(request);}catch{return json({error:'Sign in first.'},401);}
 const url=Deno.env.get('LIVEKIT_URL'),key=Deno.env.get('LIVEKIT_API_KEY'),secret=Deno.env.get('LIVEKIT_API_SECRET');
 try{
  const input=await request.json();
  if(input.action==='ready') return url&&key&&secret?json({ready:true}):json({error:'Calling is not configured yet.'},503);
  if(!uuid(input.callId))return json({error:'Invalid call.'},400);
  const {data:call,error}=await auth.db.from('calls').select('*').eq('id',input.callId).maybeSingle();
  if(error||!call)return json({error:'Call unavailable.'},403);
  if(input.action==='end'){
   const {error}=await auth.db.rpc('end_call',{p_call:call.id});if(error)throw error;
   if(url&&key&&secret){try{await new RoomServiceClient(url.replace(/^ws/,'http'),key,secret).deleteRoom(`pigeon-${call.id}`);}catch{/* Scheduled maintenance retries room deletion. */}}
   return json({ended:true});
  }
  if(!url||!key||!secret)return json({error:'Calling is not configured yet.'},503);
  if(input.action!=='token'||!['ringing','accepted'].includes(call.status)||Date.parse(call.expires_at)<=Date.now()||(auth.user.id===call.callee_id&&call.status!=='accepted'))return json({error:'Call has ended or has not been accepted.'},403);
  const {data:membership}=await admin().from('premium_memberships').select('expires_at').eq('user_id',call.caller_id).maybeSingle();
  if(!membership||Date.parse(membership.expires_at)<=Date.now())return json({error:'The caller needs an active Pigeon Plus subscription.'},403);
  const room=`pigeon-${call.id}`;
  const rooms=new RoomServiceClient(url.replace(/^ws/,'http'),key,secret);
  await rooms.createRoom({name:room,maxParticipants:2,emptyTimeout:60,departureTimeout:20});
  const token=new AccessToken(key,secret,{identity:auth.user.id,ttl:60});
  token.addGrant({room,roomJoin:true,canSubscribe:true,canPublish:true,canPublishData:false,canPublishSources:call.kind==='video'?[1,2]:[2]});
  const {data:fresh}=await auth.db.from('calls').select('status,expires_at').eq('id',call.id).maybeSingle();
  if(!fresh||!['ringing','accepted'].includes(fresh.status)||Date.parse(fresh.expires_at)<=Date.now())return json({error:'Call has ended.'},409);
  return json({url,token:await token.toJwt()});
 }catch{return json({error:'Could not connect the call. Please try again.'},503);}
});
