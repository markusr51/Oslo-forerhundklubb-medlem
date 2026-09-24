import { createOsloClient as createClient } from "../_shared/portal-scope.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const PUBLISHABLE_KEYS = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
const SECRET_KEY = SECRET_KEYS.default || "";
const PUBLISHABLE_KEY = PUBLISHABLE_KEYS.default || Deno.env.get("SUPABASE_ANON_KEY") || "";
const FIKEN_API_TOKEN = Deno.env.get("FIKEN_API_TOKEN") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-club",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {...corsHeaders, "Content-Type": "application/json"},
  });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {headers: corsHeaders});
  }

  if (req.method !== "POST") {
    return json({success:false,error:"Kun POST er tillatt."},405);
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";

    if (!authHeader.startsWith("Bearer ")) {
      return json({success:false,error:"Ikke innlogget."},401);
    }

    const userClient = createClient(SUPABASE_URL,PUBLISHABLE_KEY,{
      global:{headers:{Authorization:authHeader}},
      auth:{persistSession:false,autoRefreshToken:false},
    });

    const admin = createClient(SUPABASE_URL,SECRET_KEY,{
      auth:{persistSession:false,autoRefreshToken:false},
    });

    const {data:{user},error:userError} = await userClient.auth.getUser();

    if (userError || !user) {
      return json({success:false,error:"Ugyldig innlogging."},401);
    }

    const {data:appUser,error:appUserError} = await admin
      .from("app_users")
      .select("app_role,active")
      .eq("user_id",user.id)
      .maybeSingle();

    if (
      appUserError ||
      !appUser ||
      appUser.active !== true ||
      appUser.app_role !== "system_admin"
    ) {
      return json({
        success:false,
        error:"Bare systemadministrator kan bruke Fiken-integrasjonen.",
      },403);
    }

    if (!FIKEN_API_TOKEN) {
      return json({
        success:false,
        error:"FIKEN_API_TOKEN mangler i Supabase Secrets.",
      },500);
    }

    // Kun lesing: henter foretak nøkkelen har tilgang til.
    const response = await fetch("https://api.fiken.no/api/v2/companies",{
      method:"GET",
      headers:{
        Authorization:`Bearer ${FIKEN_API_TOKEN}`,
        Accept:"application/json",
      },
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error("Fiken svarte med feil:",response.status,responseText);
      return json({
        success:false,
        error:"Fiken API avviste forespørselen.",
        fikenStatus:response.status,
        details:responseText,
      },502);
    }

    let companies;
    try {
      companies = JSON.parse(responseText);
    } catch {
      return json({success:false,error:"Fiken returnerte ugyldig JSON."},502);
    }

    const safeCompanies = (Array.isArray(companies) ? companies : []).map(company => ({
      name:company.name || null,
      slug:company.slug || null,
      organizationNumber:company.organizationNumber || null,
    }));

    console.log("Fiken-tilkobling OK. Antall foretak:",safeCompanies.length);

    return json({success:true,companies:safeCompanies});
  } catch (error) {
    console.error("fiken-test-connection:",error);
    return json({
      success:false,
      error:error instanceof Error ? error.message : String(error),
    },500);
  }
});
