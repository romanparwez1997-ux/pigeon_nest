import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, Platform, ScrollView, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../backend/client';
import { Action, ui } from '../backend/ui';
import { Call, answerCall, endCall, invoke, rpc } from './api';
import { C } from '../theme';
const Media=lazy(()=>import('./MediaRoom').then(m=>({default:m.MediaRoom})));
export const callsSupported=()=>Platform.OS==='web'||Constants.appOwnership!=='expo';
export function CallOverlay({userId,selected,onSelected}:{userId:string;selected:Call|null;onSelected:(call:Call|null)=>void}){
 const [call,setCall]=useState<Call|null>(null),[credentials,setCredentials]=useState<{url:string;token:string}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const active=useRef<Call|null>(null);active.current=call;
 const lastHeartbeat=useRef(0);
 const ending=useRef(false);const working=useRef(false);
 useEffect(()=>{if(selected){setCall(selected);setError('');}},[selected?.id]);
 useEffect(()=>{
  let alive=true;
  const update=async()=>{
   const current=active.current;
   const query=current?supabase!.from('calls').select('*').eq('id',current.id).maybeSingle():supabase!.from('calls').select('*').eq('callee_id',userId).in('status',['ringing','accepted']).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(1).maybeSingle();
   const {data,error}=await query;if(!alive||error)return;
   if(!data||!['ringing','accepted'].includes(data.status)||Date.parse(data.expires_at)<=Date.now()){
    if(current){setCall(null);setCredentials(null);onSelected(null);}return;
   }
   if(data.status==='accepted'&&Date.now()-lastHeartbeat.current>10000){lastHeartbeat.current=Date.now();void rpc('heartbeat_call',{p_call:data.id}).catch(()=>{});}
   if(current?.id!==data.id)onSelected(data as Call);
   setCall(data as Call);
  };
  const channel=supabase!.channel(`calls-${userId}`).on('postgres_changes',{event:'*',schema:'public',table:'calls'},()=>void update()).subscribe();
  void update();const timer=setInterval(()=>void update(),3000);
  return()=>{alive=false;clearInterval(timer);void supabase!.removeChannel(channel);};
 },[userId]);
 useEffect(()=>{
  setCredentials(null);ending.current=false;let alive=true;
  if(call?.status==='accepted'&&callsSupported())void invoke<{url:string;token:string}>('call-session',{action:'token',callId:call.id}).then(v=>{if(alive)setCredentials(v);}).catch(e=>{if(alive)setError(e.message);});
  return()=>{alive=false;};
 },[call?.id,call?.status]);
 async function finish(){if(!active.current||ending.current)return;ending.current=true;try{await endCall(active.current.id);setCredentials(null);setCall(null);onSelected(null);}catch(e){setError(e instanceof Error?e.message:'Could not end call.');}finally{ending.current=false;}}
 // This release intentionally ends calls on backgrounding; no hidden microphone,
 // unconfigured CallKit or unreliable background service is implied.
 useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state==='background'&&active.current)void finish();});const hidden=()=>{if(document.visibilityState==='hidden'&&active.current)void finish();};if(Platform.OS==='web')document.addEventListener('visibilitychange',hidden);return()=>{sub.remove();if(Platform.OS==='web')document.removeEventListener('visibilitychange',hidden);};},[]);
 const close=()=>{if(!call)return;if(Platform.OS==='web'){if(window.confirm('End this call?'))void finish();}else Alert.alert('End call?','Leaving will end the call.',[{text:'Stay',style:'cancel'},{text:'End call',style:'destructive',onPress:()=>void finish()}]);};
 const accept=async()=>{if(!call||working.current)return;working.current=true;setBusy(true);setError('');try{const next=await answerCall(call.id,true);setCall(next);}catch(e){setError(e instanceof Error?e.message:'Could not answer.');}finally{working.current=false;setBusy(false);}};
 return <Modal visible={!!call} animationType="slide" onRequestClose={close} supportedOrientations={['portrait','landscape-left','landscape-right']}><SafeAreaView style={{flex:1,backgroundColor:C.bg}}><ScrollView contentContainerStyle={{padding:24,gap:18,width:'100%',maxWidth:850,alignSelf:'center'}}>
  <Text style={ui.title}>{call?.kind==='video'?'Video call':'Voice call'}</Text><Text style={ui.small}>Calls end when you leave the app. Camera and microphone start only after acceptance.</Text>
  {!callsSupported()?<Text style={ui.body}>Install a development or store build to use calls. Expo Go does not include the calling SDK.</Text>:call?.status==='ringing'?call.callee_id===userId?<><Text style={ui.body}>A connected friend is calling you.</Text><Action title="Accept call" disabled={busy} onPress={()=>void accept()}/></>:<Text style={ui.body}>Ringing… Waiting for your friend to answer.</Text>:credentials?<Suspense fallback={<ActivityIndicator/>}><Media {...credentials} video={call?.kind==='video'} onEnd={()=>void finish()} onError={setError}/></Suspense>:<ActivityIndicator/>}
  {!!error&&<Text accessibilityRole="alert" style={ui.error}>{error}</Text>}<Action title={call?.status==='ringing'&&call.callee_id===userId?'Decline':'End call'} secondary onPress={()=>void finish()}/>
 </ScrollView></SafeAreaView></Modal>;
}
