import {closeMediaRoom} from "../_shared/guideview-media.ts";
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function context(req: Request) {
  console.log("[GV] context:start");
  const authHeader = req.headers.get("Authorization") || "";
  console.log("[GV] auth-header", authHeader.startsWith("Bearer ") ? "present" : "missing");
  if (!authHeader.startsWith("Bearer ")) throw new Error("AUTH");

  const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  console.log("[GV] getUser", { ok: !!user && !error, userId: user?.id || null, error: error?.message || null });
  if (error || !user) throw new Error("AUTH");

  const { data: au, error: auError } = await admin
    .from("app_users")
    .select("person_id,app_role,active")
    .eq("user_id", user.id)
    .maybeSingle();

  console.log("[GV] app_users", { ok: !auError, found: !!au, personId: au?.person_id || null, appRole: au?.app_role || null, active: au?.active ?? null, error: auError?.message || null });
  if (auError) throw auError;
  if (!au?.active || !au.person_id) throw new Error("NO_PERSON");

  return {
    user,
    personId: au.person_id as string,
    appRole: au.app_role as string,
    admin, userClient,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Kun POST er tillatt." }, 405);

  try {
    const { personId, appRole, admin, userClient } = await context(req);
    const body = await req.json();
    const action = String(body.action || "");
    const clubId=String(body.clubId||req.headers.get('x-portal-club')||'00000000-0000-4000-8000-000000000001');
    const {data:scopeAdmin,error:scopeError}=await userClient.rpc('portal_gv_is_admin',{c:clubId,s:body.sessionId||null});
    if(scopeError)throw scopeError;
    const adminOk=scopeAdmin===true;
    console.log("[GV] request", { action, personId, appRole, adminOk });

    // v0.28.5: server-side data for the admin creation form.
    // This avoids browser RLS hiding handlers/dogs while keeping the service key server-side.
    if (action === "options") {
      const {data,error}=await userClient.rpc('portal_gv_options',{c:clubId});
      if(error)throw error; return json(data);
    }

    if (action === "create") {
      const dogId = String(body.dogId || "");
      const handlerPersonId = String(body.handlerPersonId || "");
      const type = String(body.sessionType || "follow_up");
      if (!dogId) return json({ error: "Hund mangler." }, 400);
      if (!handlerPersonId) return json({ error: "Ekvipasje mangler." }, 400);

      const { data: assignment } = await admin
        .from("dog_professional_assignments")
        .select("assignment_role,club_id")
        .eq("dog_id", dogId)
        .eq("professional_person_id", personId)
        .in("assignment_role",type==="school_training"?["skoletrener"]:["hjelpetrener","hjelpetreneraspirant"])
        .or("valid_from.is.null,valid_from.lte."+new Date().toISOString().slice(0,10))
        .or("valid_to.is.null,valid_to.gte."+new Date().toISOString().slice(0,10))
        .eq("active", true)
        .limit(1).maybeSingle();

      const role = assignment?.assignment_role;
      const allowed =
        adminOk ||
        (type === "follow_up" && ["hjelpetrener", "hjelpetreneraspirant"].includes(role)) ||
        (type === "school_training" && role === "skoletrener");

      if (!allowed) return json({ error: "Ingen tilgang til å opprette denne økten." }, 403);

      const {data:canCreate,error:createScopeError}=await userClient.rpc('portal_gv_can_create',{d:dogId,c:clubId,h:handlerPersonId||null,k:type});
      if(createScopeError)throw createScopeError;
      if(canCreate!==true)return json({error:'Ingen tilgang til hunden i valgt klubb.'},403);
      const room = `gv-${crypto.randomUUID()}`;
      const { data: s, error } = await admin
        .from("guideview_sessions")
        .insert({
          dog_id: dogId, club_id: assignment?.club_id||clubId,
          session_type: type,
          title: body.title || null,
          problem_statement: body.problemStatement || null,
          scheduled_at: body.scheduledAt || null,
          duration_minutes: body.durationMinutes || null,
          livekit_room: room,
          created_by: personId,
        })
        .select("*")
        .single();

      if (error) return json({ error: error.message }, 400);

      let portalRole = role;
      let sessionRole = role === "skoletrener" ? "trainer" : "assistantTrainer";
      if (adminOk && (!assignment || assignment.club_id===clubId)) {
        portalRole = appRole==="system_admin" ? "system_admin" : "admin";
        sessionRole = "administrator";
      }

      const { error: participantError } = await admin
        .from("guideview_session_participants")
        .insert({
          session_id: s.id,
          person_id: personId,
          portal_role: portalRole,
          session_role: sessionRole,
        });

      if (participantError) {
        await admin.from("guideview_sessions").delete().eq("id", s.id);
        return json({ error: participantError.message }, 400);
      }

      let invitation = null;
      if (handlerPersonId && handlerPersonId !== personId) {
        // Verify that the selected handler is actually linked to this dog.
        const { data: handlerLink, error: handlerLinkError } = await admin
          .from("dog_person_links")
          .select("id")
          .eq("dog_id", dogId)
          .eq("person_id", handlerPersonId)
          .eq("active", true)
          .eq("relation_type", "handler")
          .maybeSingle();

        if (handlerLinkError || !handlerLink) {
          await admin.from("guideview_session_participants").delete().eq("session_id", s.id);
          await admin.from("guideview_sessions").delete().eq("id", s.id);
          return json({ error: handlerLinkError?.message || "Valgt ekvipasje er ikke aktiv hundefører for denne hunden." }, 400);
        }

        const { data: inv, error: invitationError } = await admin
          .from("guideview_session_invitations")
          .upsert({
            session_id: s.id,
            person_id: handlerPersonId,
            status: "pending",
            created_by: personId,
            responded_at: null,
          }, { onConflict: "session_id,person_id" })
          .select("*")
          .single();

        if (invitationError) {
          await admin.from("guideview_session_participants").delete().eq("session_id", s.id);
          await admin.from("guideview_sessions").delete().eq("id", s.id);
          return json({ error: "Økten kunne ikke opprettes med invitasjon: " + invitationError.message }, 400);
        }
        invitation = inv;
      }

      console.log("[GV] create:success", { sessionId: s.id, invitationId: invitation?.id || null });
      return json({ success: true, session: s, invitation });
    }

    const sessionId = String(body.sessionId || "");
    if (!sessionId) return json({ error: "Økt mangler." }, 400);

    const { data: s, error: sessionError } = await admin
      .from("guideview_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) return json({ error: sessionError.message }, 400);
    if (!s) return json({ error: "Økten finnes ikke." }, 404);

    const { data: p } = await admin
      .from("guideview_session_participants")
      .select("portal_role,session_role")
      .eq("session_id", sessionId)
      .eq("person_id", personId)
      .maybeSingle();

    if (!p && !adminOk) return json({ error: "Ingen tilgang til økten." }, 403);

    if (action === "start") {
      if (!["planned", "open"].includes(s.state))
        return json({ error: "Økten kan ikke startes i denne statusen." }, 400);
      const { error } = await admin
        .from("guideview_sessions")
        .update({ state: "active", started_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    if (['complete','cancel'].includes(action)&&['completed','cancelled'].includes(s.state)){
      await closeMediaRoom(admin,s);return json({success:true});
    }
    if (action === "complete") {
      if (s.state !== "active")
        return json({ error: "Bare aktiv økt kan avsluttes." }, 400);
      const { error } = await admin
        .from("guideview_sessions")
        .update({ state: "completed", ended_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (error) return json({ error: error.message }, 400);
      await closeMediaRoom(admin,s);
      return json({ success: true });
    }

    if (action === "cancel") {
      if (["completed", "cancelled"].includes(s.state))
        return json({ error: "Økten kan ikke avlyses." }, 400);
      const { error } = await admin
        .from("guideview_sessions")
        .update({ state: "cancelled", ended_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (error) return json({ error: error.message }, 400);
      await closeMediaRoom(admin,s);
      return json({ success: true });
    }

    if (action === "delete") {
      console.log("[GV session-actions] delete:start", { sessionId, personId, appRole, state: s.state });
      if (!adminOk && s.created_by !== personId)
        return json({ error: "Bare oppretter eller administrator kan slette økten." }, 403);
      if (!["cancelled", "completed"].includes(s.state))
        return json({ error: "Økten må være avlyst eller avsluttet før den kan slettes." }, 400);

      await closeMediaRoom(admin,s);
      const { error: invDeleteError } = await admin.from("guideview_session_invitations").delete().eq("session_id", sessionId);
      if (invDeleteError) {
        console.error("[GV session-actions] delete:invitations", invDeleteError);
        return json({ error: "Kunne ikke slette invitasjoner: " + invDeleteError.message }, 400);
      }
      const { error: participantDeleteError } = await admin.from("guideview_session_participants").delete().eq("session_id", sessionId);
      if (participantDeleteError) {
        console.error("[GV session-actions] delete:participants", participantDeleteError);
        return json({ error: "Kunne ikke slette deltakere: " + participantDeleteError.message }, 400);
      }
      const { error: sessionDeleteError } = await admin.from("guideview_sessions").delete().eq("id", sessionId);
      if (sessionDeleteError) {
        console.error("[GV session-actions] delete:session", sessionDeleteError);
        return json({ error: "Kunne ikke slette økten: " + sessionDeleteError.message }, 400);
      }
      console.log("[GV session-actions] delete:success", { sessionId });
      return json({ success: true });
    }

    if (action === "update") {
      if (!adminOk && s.created_by !== personId)
        return json({ error: "Bare oppretter eller administrator kan redigere." }, 403);

      const patch: any = {};
      for (const [src, dst] of [
        ["title", "title"],
        ["problemStatement", "problem_statement"],
        ["scheduledAt", "scheduled_at"],
        ["durationMinutes", "duration_minutes"],
      ]) {
        if (Object.prototype.hasOwnProperty.call(body, src)) patch[dst] = body[src] || null;
      }

      const { error } = await admin.from("guideview_sessions").update(patch).eq("id", sessionId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    return json({ error: "Ugyldig handling." }, 400);
  } catch (e) {
    console.error("[GV session-actions] unhandled", e instanceof Error ? { message: e.message, stack: e.stack } : String(e));
    if ((e as Error).message === "AUTH") return json({ error: "Ikke innlogget." }, 401);
    if ((e as Error).message === "NO_PERSON")
      return json({ error: "Aktiv portalbruker er ikke koblet til person." }, 403);
    return json({ error: String(e) }, 500);
  }
});
