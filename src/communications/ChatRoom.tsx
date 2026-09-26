import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, ViewToken } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { randomUUID } from 'expo-crypto';
import { supabase } from '../backend/client';
import { LiveMessage, loadMessages, postMessage } from '../backend/api';
import { Action, ui } from '../backend/ui';
import { C } from '../theme';
import { Attachment, Call, ChatActivity, MessageReceipt, acknowledgeMessages, loadReceipts, typing } from './api';
import { openAttachment, pickAndSendFile } from './files';
import { PresenceLabel } from './Presence';
import { CallHistory } from './CallHistory';
import { messageStatus } from './status';
import { setActiveConversation } from './notifications';

type Props={conversationId:string;userId:string;name:string;premium:boolean;readingEnabled:boolean;onBack:()=>void;onReport:()=>void;onTranslate:(text:string)=>void;onCall:(kind:Call['kind'])=>void};
export function ChatRoom({conversationId,userId,name,premium,readingEnabled,onBack,onReport,onTranslate,onCall}:Props){
 const focused=useIsFocused();
 const [tab,setTab]=useState<'messages'|'calls'>('messages'),[receipts,setReceipts]=useState<MessageReceipt[]>([]);
 const [messages,setMessages]=useState<LiveMessage[]>([]),[files,setFiles]=useState<Attachment[]>([]),[activity,setActivity]=useState<ChatActivity[]>([]);
 const [body,setBody]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[older,setOlder]=useState(false),[now,setNow]=useState(Date.now());
 const list=useRef<FlatList<LiveMessage>>(null),atBottom=useRef(true),alive=useRef(true),working=useRef(false),lastTyping=useRef(0),request=useRef<{body:string;id:string}|null>(null),lastRead=useRef('');
 const visibility=useRef(focused);visibility.current=focused&&readingEnabled&&tab==='messages'&&AppState.currentState==='active'&&(Platform.OS!=='web'||document.visibilityState==='visible');
 const loaded=useRef(false),version=useRef(0);
 const latest=useRef(messages);latest.current=messages;
 const visibleMessages=useRef<string[]>([]);
 const acknowledge=useRef(()=>{});
 acknowledge.current=()=>{const ids=visibleMessages.current,key=ids.join(',');if(!visibility.current||!ids.length||lastRead.current===key)return;lastRead.current=key;void acknowledgeMessages(ids,true).catch(()=>{if(lastRead.current===key)lastRead.current='';});};
 const onViewable=useRef(({viewableItems}:{viewableItems:ViewToken<LiveMessage>[]})=>{visibleMessages.current=viewableItems.filter(v=>v.isViewable&&v.item.sender_id!==userId).map(v=>v.item.id).slice(-100);acknowledge.current();}).current;
 const refresh=useCallback(async()=>{
  const load=++version.current;
  const [rows,a,f]=await Promise.all([loadMessages(conversationId),supabase!.from('chat_activity').select('user_id,typing_until,read_at').eq('conversation_id',conversationId),supabase!.from('chat_attachments').select('*').eq('conversation_id',conversationId).order('created_at',{ascending:false}).limit(1000)]);
  if(a.error||f.error)throw Error(a.error?.message||f.error?.message);
  const receiptRows=await loadReceipts([...new Set([...rows,...latest.current].map(m=>m.id))]);
  if(!alive.current||load!==version.current)return;
  setMessages(old=>[...old.filter(m=>rows.length&&(m.created_at<rows[0].created_at||(m.created_at===rows[0].created_at&&m.id<rows[0].id))&&!rows.some(r=>r.id===m.id)),...rows]);
  setReceipts(receiptRows);setActivity(a.data||[]);setFiles(f.data||[]);if(!loaded.current){setOlder(rows.length===100);loaded.current=true;}
 },[conversationId]);
 useEffect(()=>{
  alive.current=true;void refresh().catch(e=>setError(e.message));
  const channel=supabase!.channel(`chat-${conversationId}-${userId}`);
  let timer:ReturnType<typeof setTimeout>;
  for(const table of ['messages','chat_activity','chat_attachments','message_receipts'])channel.on('postgres_changes',{event:'*',schema:'public',table,filter:`conversation_id=eq.${conversationId}`},()=>{clearTimeout(timer);timer=setTimeout(()=>void refresh().catch(e=>{if(alive.current)setError(e.message);}),150);});
  channel.subscribe();const polling=setInterval(()=>void refresh().catch(()=>{}),15000);
  return()=>{alive.current=false;clearTimeout(timer);clearInterval(polling);void supabase!.removeChannel(channel);void typing(conversationId,false).catch(()=>{});};
 },[conversationId,userId,refresh]);
 useEffect(()=>{
  setActiveConversation(focused&&readingEnabled&&tab==='messages'?conversationId:null);
  const update=()=>{visibility.current=focused&&readingEnabled&&tab==='messages'&&AppState.currentState==='active'&&(Platform.OS!=='web'||document.visibilityState==='visible');if(!visibility.current)void typing(conversationId,false).catch(()=>{});else acknowledge.current();};
  const app=AppState.addEventListener('change',update);if(Platform.OS==='web')document.addEventListener('visibilitychange',update);
  const tick=setInterval(()=>{setNow(Date.now());update();},1000);
  return()=>{app.remove();clearInterval(tick);if(Platform.OS==='web')document.removeEventListener('visibilitychange',update);setActiveConversation(null);};
 },[focused,readingEnabled,conversationId,tab]);
 useEffect(()=>{if(!body.trim())return;const stop=setTimeout(()=>void typing(conversationId,false).catch(()=>{}),3000);return()=>clearTimeout(stop);},[body,conversationId]);
 async function run(work:()=>Promise<unknown>){if(working.current)return;working.current=true;setBusy(true);setError('');try{await work();await refresh();}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Please try again.');}finally{working.current=false;if(alive.current)setBusy(false);}}
 const peer=activity.find(a=>a.user_id!==userId);
 return <KeyboardAvoidingView style={{flex:1,minWidth:0,backgroundColor:C.bg}} behavior={Platform.OS==='ios'?'padding':undefined}>
  <View style={{padding:14,gap:12,borderBottomWidth:1,borderColor:C.line}}><View style={{flexDirection:'row',alignItems:'center',gap:12,flexWrap:'wrap'}}><Action title="‹ Chats" secondary onPress={onBack}/><Text style={[ui.title,{flex:1,fontSize:24}]}>{name}</Text><Action title="Report / block" secondary onPress={onReport}/></View><PresenceLabel conversationId={conversationId}/><View style={{flexDirection:'row',gap:10,flexWrap:'wrap'}}><Action title={premium?'Voice call':'Plus · Voice call'} secondary onPress={()=>onCall('voice')}/><Action title={premium?'Video call':'Plus · Video call'} secondary onPress={()=>onCall('video')}/></View><View style={{flexDirection:'row',gap:10}}><Action title="Messages" secondary={tab!=='messages'} onPress={()=>setTab('messages')}/><Action title="Calls" secondary={tab!=='calls'} onPress={()=>setTab('calls')}/></View></View>
  {!!error&&<Text accessibilityRole="alert" style={[ui.error,{padding:12}]}>{error}</Text>}
  {tab==='calls'?<ScrollView contentContainerStyle={{padding:16}}><CallHistory userId={userId} conversationId={conversationId} personName={()=>name}/></ScrollView>:<><FlatList ref={list} data={messages} keyExtractor={m=>m.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:12,width:'100%',maxWidth:780,alignSelf:'center'}} onScroll={e=>{const {layoutMeasurement,contentOffset,contentSize}=e.nativeEvent;atBottom.current=layoutMeasurement.height+contentOffset.y>=contentSize.height-90;}} scrollEventThrottle={100} onContentSizeChange={()=>{if(atBottom.current)list.current?.scrollToEnd({animated:false});}} onViewableItemsChanged={onViewable} viewabilityConfig={{itemVisiblePercentThreshold:60,minimumViewTime:300}}
   ListHeaderComponent={older?<Action title="Earlier messages" secondary disabled={busy} onPress={()=>run(async()=>{const rows=await loadMessages(conversationId,latest.current[0]);setOlder(rows.length===100);atBottom.current=false;setMessages(old=>[...rows.filter(r=>!old.some(m=>m.id===r.id)),...old]);})}/>:null}
   ListEmptyComponent={<Text style={ui.body}>Your conversation starts here.</Text>}
   renderItem={({item:m})=>{const own=m.sender_id===userId;const file=files.find(f=>f.message_id===m.id);return <View style={{alignSelf:own?'flex-end':'flex-start',maxWidth:'90%',backgroundColor:own?C.green:'#E6EBDE',padding:16,borderRadius:14,gap:10}}>
    {file?<Pressable accessibilityRole="button" accessibilityLabel={`Download ${file.name}`} onPress={()=>run(()=>openAttachment(file))}><Text style={{color:own?'white':C.ink,fontWeight:'700'}}>↓ {file.name}</Text><Text style={{color:own?'#E1E9DB':C.muted,fontSize:12,marginTop:6}}>{(file.bytes/1024).toFixed(0)} KB · Tap to download</Text></Pressable>:<><Text selectable style={{color:own?'white':C.ink,fontSize:15,lineHeight:24}}>{m.body}</Text><Pressable accessibilityRole="button" onPress={()=>onTranslate(m.body)}><Text style={{color:own?'#E1E9DB':C.green,fontSize:12}}>Translate</Text></Pressable></>}
    <Text style={{fontSize:11,color:own?'#E1E9DB':C.muted}}>{new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}{own?` · ${messageStatus(receipts.find(r=>r.message_id===m.id),!!peer&&Date.parse(peer.read_at)>=Date.parse(m.created_at))}`:''}</Text>
   </View>;}}/>
  <View style={{width:'100%',maxWidth:780,alignSelf:'center',padding:12,gap:8,borderTopWidth:1,borderColor:C.line}}>
   {peer&&Date.parse(peer.typing_until)>now&&<Text accessibilityLiveRegion="polite" style={ui.small}>{name} is typing…</Text>}
   <View style={{flexDirection:'row',alignItems:'flex-end',gap:8}}><Action title="＋ File" secondary disabled={busy} onPress={()=>run(()=>pickAndSendFile(conversationId))}/><TextInput accessibilityLabel="Message" value={body} multiline maxLength={2000} placeholder="Send a little hello…" placeholderTextColor={C.muted} style={[ui.input,{flex:1,minWidth:0,maxHeight:120}]} onChangeText={text=>{setBody(text);if(!text.trim()||Date.now()-lastTyping.current>2000){lastTyping.current=Date.now();void typing(conversationId,!!text.trim()).catch(()=>{});}}}/><Action title="Send" disabled={busy||!body.trim()} onPress={()=>run(async()=>{if(request.current?.body!==body)request.current={body,id:randomUUID()};await postMessage(conversationId,body,request.current.id);setBody('');request.current=null;atBottom.current=true;await typing(conversationId,false).catch(()=>{});})}/></View>
   <Text style={ui.small}>Files: images, PDF or TXT · up to 10 MB</Text>
  </View></>}
 </KeyboardAvoidingView>;
}
