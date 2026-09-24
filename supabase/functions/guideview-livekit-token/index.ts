import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2.19.0";

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

const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") || "";
const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") || "";
const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-club",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status=200) {
  return new Response(JSON.stringify(body), {
    status,
    headers:{...corsHeaders,"Content-Type":"application/json"},
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok",{headers:corsHeaders});
  if (req.method !== "POST") return json({error:"Kun POST er tillatt."},405);

  try {
    const authHeader=req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({error:"Ikke innlogget."},401);

    const userClient=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{
      global:{headers:{Authorization:authHeader}},
      auth:{persistSession:false,autoRefreshToken:false},
    });
    const admin=createClient(SUPABASE_URL,SECRET_KEY,{
      auth:{persistSession:false,autoRefreshToken:false},
    });

    const {data:{user},error:userError}=await userClient.auth.getUser();
    if (userError || !user) return json({error:"Ugyldig innlogging."},401);

    const {data:profile,error:profileError}=await admin
      .from("app_users")
      .select("person_id,active")
      .eq("user_id",user.id)
      .maybeSingle();

    if (profileError || !profile?.active || !profile.person_id)
      return json({error:"Aktiv portalbruker er ikke koblet til person."},403);

    const body=await req.json();
    console.log("[GV livekit-token] request", { sessionId: body.sessionId || null });
    const sessionId=String(body.sessionId || "");
    if (!sessionId) return json({error:"Økt mangler."},400);

    const {data:session,error:sessionError}=await admin
      .from("guideview_sessions")
      .select("id,state,livekit_room")
      .eq("id",sessionId)
      .maybeSingle();

    if (sessionError || !session) return json({error:"Økten finnes ikke."},404);
    if (!["open","active"].includes(session.state))
      return json({error:"Økten er ikke åpen for tilkobling."},409);
    if (!session.livekit_room) return json({error:"Økten mangler LiveKit-rom."},500);

    const {data:participant,error:participantError}=await admin
      .from("guideview_session_participants")
      .select("portal_role,session_role")
      .eq("session_id",sessionId)
      .eq("person_id",profile.person_id)
      .maybeSingle();

    if (participantError || !participant)
      return json({error:"Du er ikke deltaker i denne økten."},403);

    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET)
      return json({error:"LiveKit er ikke konfigurert på serveren."},503);
    let livekitHost="ugyldig-url"; try{livekitHost=new URL(LIVEKIT_URL).host;}catch(_){}
    console.log("[GV livekit-token] config",{urlProtocolOk:LIVEKIT_URL.startsWith("wss://"),host:livekitHost,apiKeyLength:LIVEKIT_API_KEY.length,apiKeyPrefix:LIVEKIT_API_KEY.slice(0,4),apiSecretPresent:LIVEKIT_API_SECRET.length>0});

    // LiveKit-dokumentasjonen anbefaler at API secret bare brukes på backend.
    // Kort TTL reduserer levetiden til et lekket deltaker-token.
    const at=new AccessToken(LIVEKIT_API_KEY,LIVEKIT_API_SECRET,{
      identity:String(profile.person_id),
      name:user.email || String(profile.person_id),
      ttl:"2m",
      metadata:JSON.stringify({
        guideviewSessionId:sessionId,
        portalRole:participant.portal_role,
        sessionRole:participant.session_role,
      }),
    });

    // Abonnement åpnes først etter synkronisering av publisistenes tilgangslister.
    // Portalrollen beholdes separat i metadata, inkludert hjelpetreneraspirant.
    at.addGrant({
      roomJoin:true,
      room:session.livekit_room,
      canPublish:true,
      canSubscribe:false,
      canPublishData:false,
    });

    const token=await at.toJwt();
    try{const part=token.split(".")[1];const padded=part.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-part.length%4)%4);const payload=JSON.parse(atob(padded));console.log("[GV livekit-token] token-created",{issuerMatchesApiKey:payload?.iss===LIVEKIT_API_KEY,issuerPrefix:String(payload?.iss||"").slice(0,4),room:session.livekit_room,identity:String(profile.person_id)});}catch(e){console.warn("[GV livekit-token] token diagnostic decode failed",String(e));}
    return json({
      success:true,
      url:LIVEKIT_URL,
      token,
      room:session.livekit_room,
      portalRole:participant.portal_role,
      sessionRole:participant.session_role,
      expiresIn:"2m",
    });
  } catch (error) {
    console.error("[GV livekit-token]",error);
    return json({error:error instanceof Error ? error.message : String(error)},500);
  }
});
