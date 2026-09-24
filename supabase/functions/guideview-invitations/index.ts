import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const PUBLISHABLE_KEYS = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
const SECRET_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  SECRET_KEYS.service_role ||
  SECRET_KEYS.default ||
  "";
const PUBLISHABLE_KEY =
  PUBLISHABLE_KEYS.default ||
  Deno.env.get("SUPABASE_ANON_KEY") ||
  "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status=200) {
  return new Response(JSON.stringify(body), {status, headers:{...corsHeaders,"Content-Type":"application/json"}});
}

async function context(req: Request) {
  const authHeader=req.headers.get("Authorization")||"";
  if(!authHeader.startsWith("Bearer ")) throw new Error("AUTH");
  const userClient=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{
    global:{headers:{Authorization:authHeader}},
    auth:{persistSession:false,autoRefreshToken:false}
  });
  const admin=createClient(SUPABASE_URL,SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await userClient.auth.getUser();
  if(error||!user) throw new Error("AUTH");
  const {data:au}=await admin.from("app_users").select("person_id,app_role,active").eq("user_id",user.id).maybeSingle();
  if(!au?.active||!au.person_id) throw new Error("NO_PERSON");
  return {user, personId:au.person_id as string, appRole:au.app_role as string, admin, userClient};
}


Deno.serve(async req=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST") return json({error:"Kun POST er tillatt."},405);
 try{
  const {personId,appRole,admin,userClient}=await context(req); const b=await req.json(); const action=String(b.action||"");
  console.log("[GV invitations] request", { action, personId, appRole });
  if(action==="list"){
   console.log("[GV invitations] list:start", { personId });
   const {data:invitations,error:invError}=await admin.from("guideview_session_invitations")
     .select("id,session_id,person_id,status,created_at")
     .eq("person_id",personId).eq("status","pending").order("created_at",{ascending:false});
   if(invError){ console.error("[GV invitations] list:invitations",invError); return json({error:invError.message},400); }
   const sessionIds=[...new Set((invitations||[]).map((x:any)=>x.session_id).filter(Boolean))];
   let sessions:any[]=[];
   if(sessionIds.length){
    const {data,error}=await admin.from("guideview_sessions")
      .select("id,dog_id,title,session_type,state,scheduled_at").in("id",sessionIds);
    if(error){ console.error("[GV invitations] list:sessions",error); return json({error:error.message},400); }
    sessions=data||[];
   }
   const dogIds=[...new Set(sessions.map((x:any)=>x.dog_id).filter(Boolean))];
   let dogs:any[]=[];
   if(dogIds.length){
    const {data,error}=await admin.from("dogs").select("id,name,status").in("id",dogIds);
    if(error){ console.error("[GV invitations] list:dogs",error); return json({error:error.message},400); }
    dogs=data||[];
   }
   console.log("[GV invitations] list:success",{invitations:invitations?.length||0,sessions:sessions.length,dogs:dogs.length});
   return json({invitations:invitations||[],sessions,dogs});
  }
  if(action==="invite"){
   const sessionId=String(b.sessionId||""), target=String(b.personId||"");
   const {data:s}=await admin.from("guideview_sessions").select("created_by").eq("id",sessionId).maybeSingle();
   if(!s) return json({error:"Økten finnes ikke."},404);
   const {data:scopeAdmin,error:scopeError}=await userClient.rpc('portal_gv_is_admin',{s:sessionId});
   if(scopeError)throw scopeError;
   if(s.created_by!==personId && scopeAdmin!==true) return json({error:"Ingen tilgang."},403);
   const {data,error}=await admin.from("guideview_session_invitations").upsert({
    session_id:sessionId,person_id:target,status:"pending",created_by:personId,responded_at:null
   },{onConflict:"session_id,person_id"}).select("*").single();
   if(error) return json({error:error.message},400);
   return json({success:true,invitation:data});
  }
  if(action==="respond"){
   const id=String(b.invitationId||""), status=String(b.status||"");
   console.log("[GV invitations] respond:start", { invitationId:id, status, personId });
   if(!id) return json({error:"Invitasjon mangler."},400);
   if(!["accepted","declined"].includes(status)) return json({error:"Ugyldig svar."},400);

   const {data:inv,error:invReadError}=await admin.from("guideview_session_invitations").select("*").eq("id",id).maybeSingle();
   if(invReadError){ console.error("[GV invitations] respond:read-invitation",invReadError); return json({error:invReadError.message},400); }
   if(!inv||inv.person_id!==personId) return json({error:"Invitasjonen tilhører ikke deg."},403);

   if(status==="accepted"){
    const {data:session,error:sessionError}=await admin.from("guideview_sessions")
      .select("id,dog_id").eq("id",inv.session_id).maybeSingle();
    if(sessionError){ console.error("[GV invitations] respond:session",sessionError); return json({error:sessionError.message},400); }
    if(!session) return json({error:"Økten finnes ikke."},404);

    const {data:handlerLink,error:handlerError}=await admin.from("dog_person_links")
      .select("id").eq("dog_id",session.dog_id).eq("person_id",personId)
      .eq("active",true).eq("relation_type","handler").maybeSingle();
    if(handlerError){ console.error("[GV invitations] respond:handler-link",handlerError); return json({error:handlerError.message},400); }

    const {data:assignment,error:assignmentError}=await admin.from("dog_professional_assignments")
      .select("assignment_role").eq("dog_id",session.dog_id)
      .eq("professional_person_id",personId).eq("active",true).maybeSingle();
    if(assignmentError){ console.error("[GV invitations] respond:assignment",assignmentError); return json({error:assignmentError.message},400); }

    let portalRole="ekvipasje";
    let sessionRole="user";
    if(assignment?.assignment_role==="skoletrener"){
      portalRole="skoletrener"; sessionRole="trainer";
    }else if(["hjelpetrener","hjelpetreneraspirant"].includes(assignment?.assignment_role)){
      portalRole=assignment.assignment_role; sessionRole="assistantTrainer";
    }else if(!handlerLink){
      return json({error:"Du har ingen aktiv rolle knyttet til hunden i denne økten."},403);
    }

    const {data:existing,error:existingError}=await admin.from("guideview_session_participants")
      .select("id").eq("session_id",inv.session_id).eq("person_id",personId).maybeSingle();
    if(existingError){ console.error("[GV invitations] respond:participant-read",existingError); return json({error:existingError.message},400); }

    if(!existing){
      const {error:participantError}=await admin.from("guideview_session_participants").insert({
        session_id:inv.session_id, person_id:personId, portal_role:portalRole, session_role:sessionRole
      });
      if(participantError){ console.error("[GV invitations] respond:participant-insert",participantError); return json({error:participantError.message},400); }
    }
   }

   // Change invitation status only after participant creation succeeded.
   const {error:updateError}=await admin.from("guideview_session_invitations")
     .update({status,responded_at:new Date().toISOString()}).eq("id",id);
   if(updateError){ console.error("[GV invitations] respond:update-invitation",updateError); return json({error:updateError.message},400); }

   console.log("[GV invitations] respond:success", { invitationId:id, status });
   return json({success:true});
  }
  console.warn("[GV invitations] invalid-action", { action });
  return json({error:"Ugyldig handling."},400);
 }catch(e){
  console.error("[GV invitations]", e);
  if((e as Error).message==="AUTH") return json({error:"Ikke innlogget."},401);
  if((e as Error).message==="NO_PERSON") return json({error:"Aktiv portalbruker er ikke koblet til person."},403);
  return json({error:e instanceof Error ? e.message : String(e)},500);
 }
});
