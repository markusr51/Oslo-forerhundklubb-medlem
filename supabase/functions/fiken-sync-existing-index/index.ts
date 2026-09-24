import { createOsloClient as createClient } from "../_shared/portal-scope.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const PUBLISHABLE_KEYS = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
const SECRET_KEY = SECRET_KEYS.default || "";
const PUBLISHABLE_KEY =
  PUBLISHABLE_KEYS.default ||
  Deno.env.get("SUPABASE_ANON_KEY") ||
  "";
const FIKEN_API_TOKEN = Deno.env.get("FIKEN_API_TOKEN") || "";

const COMPANY_SLUG = "oslo-forerhundklubb";
const BASE = `https://api.fiken.no/api/v2/companies/${COMPANY_SLUG}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-club",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {...corsHeaders, "Content-Type":"application/json"},
  });
}

async function fikenGet(path: string) {
  const response = await fetch(BASE + path, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${FIKEN_API_TOKEN}`,
      Accept: "application/json",
      "X-Request-ID": crypto.randomUUID(),
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Fiken ${response.status} på ${path}: ${text.slice(0,500)}`
    );
  }

  return {
    data: text ? JSON.parse(text) : [],
    headers: response.headers,
  };
}

async function fetchAll(path: string) {
  const items: any[] = [];
  let page = 0;

  while (true) {
    const sep = path.includes("?") ? "&" : "?";
    const result = await fikenGet(`${path}${sep}page=${page}&pageSize=100`);
    const batch = Array.isArray(result.data) ? result.data : [];
    items.push(...batch);

    const pageCount =
      Number(result.headers.get("Fiken-Api-Page-Count") || "1");

    if (page + 1 >= pageCount || batch.length === 0) {
      break;
    }

    page += 1;

    // Fiken tillater bare ett samtidig kall. Litt pause mellom kallene.
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  return items;
}

function contactIdOf(c: any) {
  return c?.contactId ?? c?.id ?? null;
}

function invoiceIdOf(i: any) {
  return i?.invoiceId ?? i?.id ?? null;
}

function invoiceNumberOf(i: any) {
  return i?.invoiceNumber ?? i?.number ?? null;
}

function customerIdOf(i: any) {
  return i?.customer?.contactId ??
    i?.customer?.id ??
    i?.customerId ??
    null;
}

function grossCentsOf(i: any) {
  const candidates = [
    i?.gross,
    i?.grossAmount,
    i?.totalGross,
    i?.amount,
    i?.total,
  ];

  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v)) {
      return Math.round(v);
    }
  }

  return null;
}

function invoiceStatus(i: any) {
  if (i?.settled === true) {
    return "paid";
  }

  const due = i?.dueDate ? new Date(i.dueDate + "T23:59:59") : null;

  if (due && due.getTime() < Date.now()) {
    return "overdue";
  }

  return "outstanding";
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {headers:corsHeaders});
  }

  if (req.method !== "POST") {
    return json({success:false,error:"Kun POST er tillatt."},405);
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";

    if (!authHeader.startsWith("Bearer ")) {
      return json({success:false,error:"Ikke innlogget."},401);
    }

    const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      global:{headers:{Authorization:authHeader}},
      auth:{persistSession:false,autoRefreshToken:false},
    });

    const admin = createClient(SUPABASE_URL, SECRET_KEY, {
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
        error:"Bare systemadministrator kan synkronisere Fiken.",
      },403);
    }

    if (!FIKEN_API_TOKEN) {
      return json({
        success:false,
        error:"FIKEN_API_TOKEN mangler.",
      },500);
    }

    /*
     * 1. Kontakter.
     */
    const contacts = await fetchAll("/contacts");

    const {data:persons,error:personsError} = await admin
      .from("persons")
      .select("id,full_name,email,phone");

    if (personsError) throw personsError;

    const personByEmail = new Map(
      (persons || [])
        .filter((p:any) => p.email)
        .map((p:any) => [String(p.email).trim().toLowerCase(), p])
    );

    const personByName = new Map(
      (persons || [])
        .filter((p:any) => p.full_name)
        .map((p:any) => [String(p.full_name).trim().toLowerCase(), p])
    );

    let linkedContacts = 0;

    for (const c of contacts) {
      const id = contactIdOf(c);
      if (id == null) continue;

      const email = String(c?.email || "").trim().toLowerCase();
      const name = String(c?.name || "").trim();

      let person =
        (email ? personByEmail.get(email) : null) ||
        (name ? personByName.get(name.toLowerCase()) : null) ||
        null;

      if (person) linkedContacts += 1;

      const {error} = await admin
        .from("fiken_contacts")
        .upsert({
          fiken_contact_id:id,
          person_id:person?.id || null,
          name:name || null,
          email:email || null,
          phone:c?.phoneNumber || c?.phone || null,
          customer_number:c?.customerNumber || null,
          inactive:c?.inactive === true,
          raw_json:c,
          synced_at:new Date().toISOString(),
        }, {
          onConflict:"fiken_contact_id",
        });

      if (error) throw error;
    }

    /*
     * 2. Fakturaer.
     */
    const invoices = await fetchAll("/invoices");

    const {data:localContacts,error:lcError} = await admin
      .from("fiken_contacts")
      .select("fiken_contact_id,person_id");

    if (lcError) throw lcError;

    const personByFikenContact = new Map(
      (localContacts || []).map((c:any) => [
        Number(c.fiken_contact_id),
        c.person_id || null,
      ])
    );

    let linkedInvoices = 0;
    let paid = 0;
    let overdue = 0;
    let outstanding = 0;

    for (const i of invoices) {
      const id = invoiceIdOf(i);
      if (id == null) continue;

      const customerId = customerIdOf(i);
      const personId =
        customerId != null
          ? personByFikenContact.get(Number(customerId)) || null
          : null;

      if (personId) linkedInvoices += 1;

      const status = invoiceStatus(i);
      if (status === "paid") paid += 1;
      if (status === "overdue") overdue += 1;
      if (status === "outstanding") outstanding += 1;

      const {error} = await admin
        .from("fiken_invoices")
        .upsert({
          fiken_invoice_id:id,
          fiken_invoice_number:invoiceNumberOf(i),
          fiken_customer_id:customerId,
          person_id:personId,
          issue_date:i?.issueDate || null,
          due_date:i?.dueDate || null,
          settled:i?.settled === true,
          status,
          amount_gross_cents:grossCentsOf(i),
          order_reference:i?.orderReference || null,
          raw_json:i,
          synced_at:new Date().toISOString(),
        }, {
          onConflict:"fiken_invoice_id",
        });

      if (error) throw error;
    }

    return json({
      success:true,
      companySlug:COMPANY_SLUG,
      contacts:{
        total:contacts.length,
        linked:linkedContacts,
      },
      invoices:{
        total:invoices.length,
        linked:linkedInvoices,
        paid,
        overdue,
        outstanding,
      },
    });

  } catch (error) {
    console.error("fiken-sync-existing:", error);

    return json({
      success:false,
      error:error instanceof Error ? error.message : String(error),
    },500);
  }
});
