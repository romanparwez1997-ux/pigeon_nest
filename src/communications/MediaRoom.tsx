// Metro selects MediaRoom.native.tsx on Android/iOS. This file is the web client.
import React from 'react';
import { View, Text } from 'react-native';
import { LiveKitRoom, RoomAudioRenderer, VideoTrack, useTracks, useLocalParticipant } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Action, ui } from '../backend/ui';
export type MediaProps={url:string;token:string;video:boolean;onEnd:()=>void;onError:(message:string)=>void};
function Controls({onEnd,onError,video}:Pick<MediaProps,'onEnd'|'onError'|'video'>){const {localParticipant,isMicrophoneEnabled,isCameraEnabled}=useLocalParticipant();const tracks=useTracks([Track.Source.Camera]);return <View style={{gap:12}}>
 <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{tracks.map(t=><View key={t.participant.identity} style={{width:'100%',maxWidth:420,aspectRatio:1.4,backgroundColor:'#142B24'}}><VideoTrack trackRef={t} style={{width:'100%',height:'100%',objectFit:'cover'}}/></View>)}</View>
 <Text style={ui.small}>Connected · {tracks.length? 'Video call':'Voice call'}</Text>
 <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}><Action title={isMicrophoneEnabled?'Mute':'Unmute'} secondary onPress={()=>{void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled).catch(e=>onError(e.message));}}/>{video&&<Action title={isCameraEnabled?'Camera off':'Camera on'} secondary onPress={()=>{void localParticipant.setCameraEnabled(!isCameraEnabled).catch(e=>onError(e.message));}}/>}<Action title="End call" onPress={onEnd}/></View><RoomAudioRenderer/>
 </View>;}
export function MediaRoom({url,token,video,onEnd,onError}:MediaProps){return <LiveKitRoom serverUrl={url} token={token} connect audio video={video} onDisconnected={onEnd} onError={e=>onError(e.message)} onMediaDeviceFailure={()=>onError('Allow microphone/camera access in browser settings, then try again.')}><Controls onEnd={onEnd} onError={onError} video={video}/></LiveKitRoom>;}
