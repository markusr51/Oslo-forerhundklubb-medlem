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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-club",
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
    const {personId,appRole,admin,userClient}=await context(req);
    const b=await req.json(); const action=String(b.action||"");
    const clubId=String(b.clubId||req.headers.get('x-portal-club')||'00000000-0000-4000-8000-000000000001');
    const {data:scopeAllowed,error:scopeError}=await userClient.rpc('portal_gv_assignment_allowed',{c:clubId,d:b.dogId||null,p:b.personId||null,a:action==='deactivate'?b.assignmentId||null:null});
    if(scopeError)throw scopeError;
    if(scopeAllowed!==true)return json({error:'Ingen administratortilgang til denne tilknytningen.'},403);
    if(action==="assign"){
      const role=String(b.assignmentRole||"");
      if(!["hjelpetrener","hjelpetreneraspirant","skoletrener"].includes(role)) return json({error:"Ugyldig fagrolle."},400);
      const dogId=String(b.dogId||""), professional=String(b.personId||"");
      if(!dogId||!professional) return json({error:"Hund og person kreves."},400);

      // Kontroller at personen faktisk har rollen.
      const {data:roles}=await admin.from("person_roles").select("role_id,roles!inner(name)")
        .eq("person_id",professional).eq("is_active",true);
      const hasRole=(roles||[]).some((x:any)=>String(x.roles?.name||"").toLowerCase()===role);
      if(!hasRole) return json({error:"Personen har ikke valgt fagrolle i portalen."},400);

      const {data,error}=await admin.from("dog_professional_assignments").insert({
        club_id:clubId,dog_id:dogId,professional_person_id:professional,assignment_role:role,
        valid_from:b.validFrom||null,valid_to:b.validTo||null,notes:b.notes||null,created_by:personId
      }).select("*").single();
      if(error) return json({error:error.message},400);
      return json({success:true,assignment:data});
    }
    if(action==="deactivate"){
      const id=String(b.assignmentId||"");
      const {error}=await admin.from("dog_professional_assignments").update({active:false,valid_to:b.validTo||new Date().toISOString().slice(0,10)}).eq("id",id);
      if(error) return json({error:error.message},400);
      return json({success:true});
    }
    return json({error:"Ugyldig handling."},400);
  }catch(e){
    console.error("[GV assignments]", e);
    if((e as Error).message==="AUTH") return json({error:"Ikke innlogget."},401);
    if((e as Error).message==="NO_PERSON") return json({error:"Aktiv portalbruker er ikke koblet til person."},403);
    return json({error:e instanceof Error ? e.message : String(e)},500);
  }
});
