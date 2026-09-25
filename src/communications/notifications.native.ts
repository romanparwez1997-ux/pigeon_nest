import type { NotificationResponse } from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../backend/client';
import { rpc } from './api';
const KEY='pigeon-post.push-device';
let currentConversation: string | null=null;
export function setActiveConversation(id: string | null){currentConversation=id;}
export async function enablePush(userId: string): Promise<string> {
 if(Constants.appOwnership==='expo')return 'Install a development or store build to enable push notifications. Expo Go does not support them.';
 const projectId=Constants.easConfig?.projectId||Constants.expoConfig?.extra?.eas?.projectId;
 if(!projectId)throw Error('Link this app to EAS and rebuild before enabling notifications.');
 const N=await import('expo-notifications');
 if(Platform.OS==='android')await N.setNotificationChannelAsync('messages',{name:'Messages and calls',importance:N.AndroidImportance.HIGH});
 let permission=await N.getPermissionsAsync();if(permission.status!=='granted')permission=await N.requestPermissionsAsync();
 if(permission.status!=='granted')return 'Notifications are off. You can enable them in your device settings.';
 const token=(await N.getExpoPushTokenAsync({projectId})).data;
 const {data}=await supabase!.auth.getUser();if(data.user?.id!==userId)throw Error('Your account changed. Please try again.');
 await rpc('register_push_token',{p_token:token});await AsyncStorage.setItem(KEY,JSON.stringify({userId,token}));
 return 'Notifications enabled for messages and incoming calls.';
}
export async function removeDevicePush(){
 const raw=await AsyncStorage.getItem(KEY);if(!raw)return;
 const record=JSON.parse(raw);
 await rpc('unregister_push_token',{p_token:record.token});await AsyncStorage.removeItem(KEY);
}
export async function listenForNotifications(userId: string, open: (conversation: string)=>void){
 if(Constants.appOwnership==='expo')return ()=>{};
 const N=await import('expo-notifications');
 N.setNotificationHandler({handleNotification:async n=>{const show=n.request.content.data?.conversationId!==currentConversation;return {shouldShowBanner:show,shouldShowList:show,shouldPlaySound:show,shouldSetBadge:false};}});
 let alive=true;
 const handle=(response: NotificationResponse)=>{
  const id=response.notification.request.content.data?.conversationId;
  if(alive&&typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id)){open(id);void N.clearLastNotificationResponseAsync();}
 };
 const listener=N.addNotificationResponseReceivedListener(handle);
 const previous=await N.getLastNotificationResponseAsync();if(previous)handle(previous);
 const raw=await AsyncStorage.getItem(KEY);
 if(raw){try{const record=JSON.parse(raw);if((await N.getPermissionsAsync()).status==='granted'){await rpc('register_push_token',{p_token:record.token});await AsyncStorage.setItem(KEY,JSON.stringify({userId,token:record.token}));}}catch{/* Retry through Enable notifications. */}}
 const rollover=N.addPushTokenListener(()=>{void enablePush(userId).catch(()=>{});});
 return ()=>{alive=false;listener.remove();rollover.remove();currentConversation=null;};
}
