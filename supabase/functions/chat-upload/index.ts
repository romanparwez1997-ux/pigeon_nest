import { admin, authenticated, cors, json, uuid } from '../_shared/communication.ts';
import { MAX_FILE_BYTES, validateFile } from '../_shared/file-validation.ts';
Deno.serve(async request=>{
 if(request.method==='OPTIONS') return new Response('ok',{headers:cors});
 if(request.method!=='POST') return json({error:'Method not allowed'},405);
 let auth;
 try {auth=await authenticated(request);} catch {return json({error:'Sign in first.'},401);}
 const conversation=request.headers.get('x-conversation-id');
 const client=request.headers.get('x-request-id');
 if(!uuid(conversation)||!uuid(client)) return json({error:'Invalid conversation or request.'},400);
 const {data:allowed}=await auth.db.rpc('can_read_conversation',{p_conversation:conversation});
 if(!allowed) return json({error:'Conversation unavailable.'},403);
 const path=`${auth.user.id}/${conversation}/${client}`;
 const {data:existing}=await auth.db.from('chat_attachments').select('message_id').eq('path',path).maybeSingle();
 if(existing) return json({id:existing.message_id});
 const size=Number(request.headers.get('content-length')||0);
 if(size>MAX_FILE_BYTES) return json({error:'Choose a file up to 10 MB.'},413);
 try {
  // Bound streaming reads even if Content-Length is missing or dishonest.
  const reader=request.body?.getReader(); if(!reader) throw new Error('Choose a file.');
  const chunks:Uint8Array[]=[];let length=0;
  while(true){ const {done,value}=await reader.read();if(done)break; length+=value.length;if(length>MAX_FILE_BYTES){await reader.cancel();throw new Error('Choose a file up to 10 MB.');}chunks.push(value); }
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const {name,mime}=validateFile(bytes,decodeURIComponent(request.headers.get('x-file-name')||''));
  const db=admin();
  const {error:upload}=await db.storage.from('chat-files').upload(path,bytes,{contentType:mime,upsert:false});
  if(upload) throw new Error('Upload unavailable. Please retry.');
  const {data,error}=await db.rpc('publish_attachment',{p_user:auth.user.id,p_conversation:conversation,p_client:client,p_path:path,p_name:name,p_mime:mime,p_bytes:length});
  if(error){await db.storage.from('chat-files').remove([path]);throw new Error(error.message);}
  return json({id:data});
 } catch(e){return json({error:e instanceof Error?e.message:'Upload failed.'},400);}
});
