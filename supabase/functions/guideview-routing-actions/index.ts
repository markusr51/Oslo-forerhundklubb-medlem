import {mediaService,routeVersion,syncMedia} from "../_shared/guideview-media.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").service_role||JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";
const PUB=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||Deno.env.get("SUPABASE_ANON_KEY")||"";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-portal-club","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"Content-Type":"application/json"}});

async function ctx(req:Request){
 const ah=req.headers.get("Authorization")||"";
 if(!ah.startsWith("Bearer "))throw new Error("AUTH");
 const uc=createClient(URL,PUB,{global:{headers:{Authorization:ah}},auth:{persistSession:false}});
 const admin=createClient(URL,SERVICE,{auth:{persistSession:false}});
 const {data:{user},error}=await uc.auth.getUser();
 if(error||!user)throw new Error("AUTH");
 const {data:p,error:pe}=await admin.from("app_users").select("person_id,app_role,active").eq("user_id",user.id).maybeSingle();
 if(pe)throw pe;if(!p?.active||!p.person_id)throw new Error("NO_PERSON");
 return {admin,uc,personId:p.person_id as string,appRole:p.app_role as string};
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const {admin,uc,personId,appRole}=await ctx(req);const b=await req.json();const action=String(b.action||"");const sessionId=String(b.sessionId||"");
  if(!sessionId)return json({error:"Økt mangler."},400);
  const {data:participant}=await admin.from("guideview_session_participants").select("session_role").eq("session_id",sessionId).eq("person_id",personId).maybeSingle();
  const {data:scopeAdmin,error:scopeError}=await uc.rpc('portal_gv_is_admin',{s:sessionId});
  if(scopeError)throw scopeError;
  const director=scopeAdmin===true||["trainer","administrator"].includes(participant?.session_role);
  const {data:session,error:sessionError}=await admin.from('guideview_sessions').select('id,state,livekit_room').eq('id',sessionId).maybeSingle();
  if(sessionError)throw sessionError;if(!session)return json({error:'Økten finnes ikke.'},404);
  if(action==='ack'){
   if(!participant)return json({error:'Ingen tilgang.'},403);
   const {data:routes,error}=await admin.from('guideview_media_routes').select('*').eq('session_id',sessionId);if(error)throw error;
   if(String(b.version)!==routeVersion(routes||[],personId))return json({error:'Ruting er endret. Hent den på nytt.'},409);
   const live=await mediaService().getParticipant(session.livekit_room,personId);
   if(live.sid!==b.participantSid)return json({error:'Tilkoblingen er endret.'},409);
   const {error:ackError}=await admin.from('portal_gv_media_ack').upsert({session_id:sessionId,person_id:personId,participant_sid:live.sid,route_version:b.version});if(ackError)throw ackError;
   return json({success:true});
  }
  if(action==="get"){
   if(!participant&&!director)return json({error:"Ingen tilgang til økten."},403);
   const {data:parts,error:pe}=await admin.from("guideview_session_participants").select("person_id,portal_role,session_role").eq("session_id",sessionId);
   if(pe)return json({error:pe.message},400);
   const ids=[...new Set((parts||[]).map((x:any)=>x.person_id))];
   let people:any[]=[]; if(ids.length){const r=await admin.from("portal_person_identities").select("id,full_name").in("id",ids);if(r.error)return json({error:r.error.message},400);people=r.data||[];}
   const {data:routes,error:re}=await admin.from("guideview_media_routes").select("*").eq("session_id",sessionId);
   if(re)return json({error:re.message},400);
   if(['active','open'].includes(session.state))await syncMedia(admin,session,parts||[],routes||[]);
   // Publishers install the server-enforced subscriber ACL before acknowledging it.
   return json({participants:parts||[],people,routes:routes||[],director,currentPersonId:personId,state:session.state,publisherVersion:routeVersion(routes||[],personId)});
  }
  if(action==="set"){
   if(["completed","cancelled"].includes(session.state))return json({error:"Økten er avsluttet."},409);
   if(!director)return json({error:"Bare skoletrener eller administrator kan endre lyd/video-ruting."},403);
   const source=String(b.sourcePersonId||""),target=String(b.targetPersonId||"");
   if(!source||!target||source===target)return json({error:"Ugyldig ruting."},400);
   const {data:members,error:memberError}=await admin.from('guideview_session_participants').select('person_id').eq('session_id',sessionId);if(memberError)throw memberError;
   if(!members?.some(x=>x.person_id===source)||!members.some(x=>x.person_id===target))return json({error:'Velg deltakere i denne økten.'},400);
   // Block the recipient before changing a rule; only a fresh publisher ACL reopens it.
   if(['active','open'].includes(session.state)){try{await mediaService().updateParticipant(session.livekit_room,target,{permission:{canSubscribe:false,canPublish:true,canPublishData:false}});}catch(e){if((e as any).code!=='not_found')throw e;}}
   const patch:any={session_id:sessionId,source_person_id:source,target_person_id:target,updated_at:new Date().toISOString(),updated_by_person_id:personId};
   if(typeof b.audioEnabled==="boolean")patch.audio_enabled=b.audioEnabled;
   if(typeof b.videoEnabled==="boolean")patch.video_enabled=b.videoEnabled;
   const {data:existing}=await admin.from("guideview_media_routes").select("audio_enabled,video_enabled").eq("session_id",sessionId).eq("source_person_id",source).eq("target_person_id",target).maybeSingle();
   if(typeof patch.audio_enabled!=="boolean")patch.audio_enabled=existing?.audio_enabled??true;
   if(typeof patch.video_enabled!=="boolean")patch.video_enabled=existing?.video_enabled??true;
   const {error}=await admin.from("guideview_media_routes").upsert(patch,{onConflict:"session_id,source_person_id,target_person_id"});
   if(error)return json({error:error.message},400);
   console.log("[GV routing] set",{sessionId,source,target,audio:patch.audio_enabled,video:patch.video_enabled,by:personId});
   return json({success:true});
  }
  return json({error:"Ugyldig handling."},400);
 }catch(e){console.error("[GV routing]",e);if((e as Error).message==="AUTH")return json({error:"Ikke innlogget."},401);return json({error:e instanceof Error?e.message:String(e)},500);}
});
