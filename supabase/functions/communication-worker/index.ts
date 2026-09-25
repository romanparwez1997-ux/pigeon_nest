import { RoomServiceClient } from 'npm:livekit-server-sdk@2.15.0';
import { admin, json } from '../_shared/communication.ts';
Deno.serve(async request=>{
 const secret=Deno.env.get('COMMUNICATION_WORKER_SECRET');
 if(request.method!=='POST'||!secret||request.headers.get('Authorization')!==`Bearer ${secret}`)return json({error:'Unauthorized'},401);
 const db=admin();
 try{
  const {data:cleanup,error:maintenanceError}=await db.rpc('communication_maintenance');if(maintenanceError)throw maintenanceError;
  const url=Deno.env.get('LIVEKIT_URL'),key=Deno.env.get('LIVEKIT_API_KEY'),apiSecret=Deno.env.get('LIVEKIT_API_SECRET');
  if(url&&key&&apiSecret){const rooms=new RoomServiceClient(url.replace(/^ws/,'http'),key,apiSecret);for(const id of cleanup.rooms){try{await rooms.deleteRoom(`pigeon-${id}`);await db.rpc('finish_communication_cleanup',{p_room:id});}catch(e){if((e as {status?:number}).status===404)await db.rpc('finish_communication_cleanup',{p_room:id});}}}
  for(const path of cleanup.files){const {error}=await db.storage.from('chat-files').remove([path]);if(!error)await db.rpc('finish_communication_cleanup',{p_path:path});}
  const {data:jobs,error}=await db.rpc('claim_push_jobs');if(error)throw error;
  const headers:Record<string,string>={'Content-Type':'application/json'};
  const accessToken=Deno.env.get('EXPO_ACCESS_TOKEN');if(accessToken)headers.Authorization=`Bearer ${accessToken}`;
  await Promise.all(jobs.map(async(job: {id:number;lease:string;ticket:string|null;token:string;call_id:string|null;conversation_id:string})=>{
   try{
    let result;
    if(job.ticket){
     const response=await fetch('https://exp.host/--/api/v2/push/getReceipts',{method:'POST',headers,body:JSON.stringify({ids:[job.ticket]}),signal:AbortSignal.timeout(10000)});
     if(!response.ok)return;
     result=(await response.json()).data?.[job.ticket];
     if(!result)return;
    }else{
     const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers,body:JSON.stringify({to:job.token,title:'Pigeon Post',body:job.call_id?'An incoming call from a connected friend.':'You have a new message.',sound:'default',channelId:'messages',priority:'high',ttl:job.call_id?40:3600,data:{conversationId:job.conversation_id,callId:job.call_id}}),signal:AbortSignal.timeout(10000)});
     if(!response.ok)return;
     result=(await response.json()).data;
    }
    const invalid=result?.details?.error==='DeviceNotRegistered';
    const success=result?.status==='ok';
    await db.rpc('finish_push_job',{p_id:job.id,p_lease:job.lease,p_done:!!job.ticket&&success||invalid||result?.details?.error==='MessageTooBig',p_ticket:!job.ticket&&success?result.id:null,p_invalid:invalid});
   }catch{/* Leased jobs retry with a bounded attempt count. No tokens or messages logged. */}
  }));
  return json({processed:jobs.length});
 }catch{return json({error:'Communication dispatch failed.'},500);}
});
