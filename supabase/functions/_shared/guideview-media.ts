import { RoomServiceClient } from 'npm:livekit-server-sdk@2.19.0';
export function mediaService(){
 const url=(Deno.env.get('LIVEKIT_URL')||'').replace(/^wss:/,'https:').replace(/^ws:/,'http:');
 if(!url||!Deno.env.get('LIVEKIT_API_KEY')||!Deno.env.get('LIVEKIT_API_SECRET'))throw Error('LiveKit er ikke konfigurert.');
 return new RoomServiceClient(url,Deno.env.get('LIVEKIT_API_KEY')!,Deno.env.get('LIVEKIT_API_SECRET')!);
}
export const routeVersion=(routes:any[],source:string)=>routes.filter(r=>r.source_person_id===source).map(r=>`${r.target_person_id}:${r.audio_enabled}:${r.video_enabled}:${r.updated_at}`).sort().join('|');
export async function syncMedia(admin:any,session:any,parts:any[],routes:any[]){
 const api=mediaService();let live;
 try{live=await api.listParticipants(session.livekit_room);}catch(e){if((e as any).code==='not_found')return;throw e;}
 const {data:acks,error}=await admin.from('portal_gv_media_ack').select('*').eq('session_id',session.id);if(error)throw error;
 const ready=live.every(p=>!(p.tracks?.length)||acks?.some((a:any)=>a.person_id===p.identity&&a.participant_sid===p.sid&&a.route_version===routeVersion(routes,p.identity)));
 for(const p of live){const allowed=parts.some(x=>x.person_id===p.identity);
  if(!allowed){await api.removeParticipant(session.livekit_room,p.identity);continue;}
  // Receivers cannot subscribe at all while a publisher's server ACL is pending.
  if(p.permission?.canSubscribe!==ready||p.permission?.canPublishData!==false)await api.updateParticipant(session.livekit_room,p.identity,{permission:{canSubscribe:ready,canPublish:true,canPublishData:false}});
  const denied=live.flatMap(src=>{const r=routes.find(r=>r.source_person_id===src.identity&&r.target_person_id===p.identity);return (src.tracks||[]).filter(t=>r&&((t.type===0&&!r.audio_enabled)||(t.type===1&&!r.video_enabled))).map(t=>t.sid);});
  if(denied.length)await api.updateSubscriptions(session.livekit_room,p.identity,denied,false);
 }
}
export async function closeMediaRoom(admin:any,session:any){
 if(!session.livekit_room)return;const api=mediaService();
 const {data:parts,error}=await admin.from('guideview_session_participants').select('person_id').eq('session_id',session.id);if(error)throw error;
 for(const p of parts||[]){try{await api.removeParticipant(session.livekit_room,p.person_id);}catch(e){if((e as any).code!=='not_found')throw e;}}
 try{await api.deleteRoom(session.livekit_room);}catch(e){if((e as any).code!=='not_found')throw e;}
}
