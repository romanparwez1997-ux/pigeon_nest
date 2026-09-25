import { Platform, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { randomUUID } from 'expo-crypto';
import { supabase } from '../backend/client';
import type { Attachment } from './api';
export const fileTypes = ['image/jpeg','image/png','image/webp','application/pdf','text/plain'];
export async function pickAndSendFile(conversation: string) {
 const result=await DocumentPicker.getDocumentAsync({type:fileTypes,copyToCacheDirectory:true,multiple:false,base64:false});
 if(result.canceled)return false;
 const asset=result.assets[0];
 if(!asset.size || asset.size>10*1024*1024)throw Error('Choose a file up to 10 MB.');
 const bytes=asset.file?await asset.file.arrayBuffer():await new File(asset.uri).arrayBuffer();
 const {data}=await supabase!.auth.getSession();if(!data.session)throw Error('Sign in first.');
 const response=await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/chat-upload`,{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,apikey:process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,'Content-Type':'application/octet-stream','x-conversation-id':conversation,'x-request-id':randomUUID(),'x-file-name':encodeURIComponent(asset.name)},body:bytes});
 const json=await response.json();if(!response.ok)throw Error(json.error||'File upload failed.');return true;
}
export async function openAttachment(file: Attachment) {
 const {data,error}=await supabase!.storage.from('chat-files').createSignedUrl(file.path,60,{download:file.name});
 if(error)throw Error(error.message);
 if(Platform.OS==='web'){await Linking.openURL(data.signedUrl);return;}
 const destination=new File(Paths.cache,`${randomUUID()}-${file.name}`);
 try{
  const download=await File.downloadFileAsync(data.signedUrl,destination);
  if(!await Sharing.isAvailableAsync())throw Error('File sharing is unavailable on this device.');
  await Sharing.shareAsync(download.uri,{mimeType:file.mime,dialogTitle:file.name});
 }finally{if(destination.exists)destination.delete();}
}
