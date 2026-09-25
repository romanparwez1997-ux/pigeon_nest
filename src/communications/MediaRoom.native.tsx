import React, { useEffect, useState } from 'react';
import { View, Text, PermissionsAndroid, Platform } from 'react-native';
import { AudioSession, LiveKitRoom, VideoTrack, useTracks, useLocalParticipant, isTrackReference, registerGlobals } from '@livekit/react-native';
import { Track } from 'livekit-client';
import { Action, ui } from '../backend/ui';
export type MediaProps={url:string;token:string;video:boolean;onEnd:()=>void;onError:(message:string)=>void};
registerGlobals();
function Controls({onEnd,video,onError}:Pick<MediaProps,'onEnd'|'video'|'onError'>){
 const {localParticipant,isMicrophoneEnabled,isCameraEnabled}=useLocalParticipant();const tracks=useTracks([Track.Source.Camera]);
 return <View style={{gap:12}}><View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{tracks.filter(isTrackReference).map(t=><VideoTrack key={t.participant.identity} trackRef={t} style={{width:'100%',maxWidth:420,aspectRatio:1.4}}/>)}</View><Text style={ui.small}>Connected · {video?'Video call':'Voice call'}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}><Action title={isMicrophoneEnabled?'Mute':'Unmute'} secondary onPress={()=>{void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled).catch(e=>onError(e.message));}}/>{video&&<Action title={isCameraEnabled?'Camera off':'Camera on'} secondary onPress={()=>{void localParticipant.setCameraEnabled(!isCameraEnabled).catch(e=>onError(e.message));}}/>}<Action title="End call" onPress={onEnd}/></View></View>;
}
export function MediaRoom({url,token,video,onEnd,onError}:MediaProps){
 const [ready,setReady]=useState(false);
 useEffect(()=>{let alive=true;void(async()=>{
  if(Platform.OS==='android'){const required=[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,...(video?[PermissionsAndroid.PERMISSIONS.CAMERA]:[])];const permissions=await PermissionsAndroid.requestMultiple(required);if(required.some(p=>permissions[p]!==PermissionsAndroid.RESULTS.GRANTED))throw Error('Microphone/camera permission is required to join this call.');}
  await AudioSession.startAudioSession();if(alive)setReady(true);else await AudioSession.stopAudioSession();
 })().catch(e=>{if(alive)onError(e.message);});return()=>{alive=false;void AudioSession.stopAudioSession();};},[]);
 return ready?<LiveKitRoom serverUrl={url} token={token} connect audio video={video} onDisconnected={onEnd} onError={e=>onError(e.message)}><Controls onEnd={onEnd} video={video} onError={onError}/></LiveKitRoom>:<Text style={ui.body}>Preparing microphone…</Text>;
}
