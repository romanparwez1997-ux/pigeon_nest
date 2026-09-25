import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Action, ui } from '../backend/ui';
import { enablePush } from './notifications';
export function NotificationSettings({userId}:{userId:string}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 return <View style={{gap:10}}><Action title="Enable message & call notifications" secondary disabled={busy} onPress={async()=>{setBusy(true);try{setMessage(await enablePush(userId));}catch(e){setMessage(e instanceof Error?e.message:'Could not enable notifications.');}finally{setBusy(false);}}}/>{!!message&&<Text accessibilityRole="alert" style={ui.small}>{message}</Text>}</View>;
}
