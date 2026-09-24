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
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-portal-club",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};

function json(body:unknown,status=200) {
  return new Response(JSON.stringify(body),{
    status,
    headers:{...corsHeaders,"Content-Type":"application/json"},
  });
}

async function requireSystemAdmin(req:Request) {
  const authHeader = req.headers.get("Authorization") || "";

  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("AUTH:Ikke innlogget.");
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
    throw new Error("AUTH:Ugyldig innlogging.");
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
    throw new Error("AUTH:Bare systemadministrator kan lage Fiken-faktura.");
  }

  return {admin,user};
}

async function fiken(path:string,options:any={}) {
  const response = await fetch(BASE + path,{
    ...options,
    headers:{
      Authorization:`Bearer ${FIKEN_API_TOKEN}`,
      Accept:"application/json",
      "Content-Type":"application/json",
      "X-Request-ID":crypto.randomUUID(),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();

  return {
    ok:response.ok,
    status:response.status,
    text,
    data:text ? (()=>{try{return JSON.parse(text)}catch{return null}})() : null,
    location:response.headers.get("Location"),
  };
}


function normalizeNorwegianMobile(value:any){
  let s=String(value||"").trim().replace(/[()\s.-]/g,"");
  if(s.startsWith("0047")) s=s.slice(4);
  if(s.startsWith("+47")) s=s.slice(3);
  const digits=s.replace(/\D/g,"");
  return /^\d{8}$/.test(digits) ? digits : null;
}

async function getSetup(admin:any) {
  // Ett API-kall om gangen.
  const banks = await fiken("/bankAccounts?page=0&pageSize=100",{method:"GET"});
  if (!banks.ok) {
    throw new Error(`Kunne ikke hente bankkontoer fra Fiken (${banks.status}): ${banks.text.slice(0,300)}`);
  }

  await new Promise(resolve=>setTimeout(resolve,300));

  const accounts = await fiken("/accounts?fromAccount=3000&toAccount=3999&page=0&pageSize=100",{method:"GET"});
  if (!accounts.ok) {
    throw new Error(`Kunne ikke hente inntektskontoer fra Fiken (${accounts.status}): ${accounts.text.slice(0,300)}`);
  }

  const {data:links,error:linksError} = await admin
    .from("fiken_contacts")
    .select("fiken_contact_id,person_id,name,email,inactive")
    .not("person_id","is",null)
    .eq("inactive",false);

  if (linksError) throw linksError;

  const personIds = [...new Set((links || []).map((x:any)=>x.person_id))];

  let people:any[] = [];
  if (personIds.length) {
    const {data,error} = await admin
      .from("persons")
      .select("id,full_name,email,phone")
      .in("id",personIds)
      .order("full_name");

    if (error) throw error;
    people = data || [];
  }

  const linkByPerson = new Map(
    (links || []).map((x:any)=>[x.person_id,x])
  );

  return {
    success:true,
    people:people.map((p:any)=>({
      id:p.id,
      full_name:p.full_name,
      email:p.email,
      phone:p.phone,
      fiken_contact_id:linkByPerson.get(p.id)?.fiken_contact_id || null,
    })),
    bankAccounts:(Array.isArray(banks.data) ? banks.data : [])
      .filter((b:any)=>b?.type === "normal")
      .map((b:any)=>({
        name:b.name || "",
        accountCode:b.accountCode || "",
        bankAccountNumber:b.bankAccountNumber || "",
      })),
    incomeAccounts:(Array.isArray(accounts.data) ? accounts.data : [])
      .map((a:any)=>({
        code:a.code || "",
        name:a.name || "",
      })),
  };
}

function extractIdFromLocation(location:string|null) {
  if (!location) return null;
  const parts = location.split("/").filter(Boolean);
  const last = Number(parts[parts.length-1]);
  return Number.isFinite(last) ? last : null;
}

function datePlusDays(days:number) {
  const d = new Date();
  d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}

Deno.serve(async req=>{
  if (req.method === "OPTIONS") {
    return new Response("ok",{headers:corsHeaders});
  }

  if (req.method !== "POST") {
    return json({success:false,error:"Kun POST er tillatt."},405);
  }

  try {
    const {admin} = await requireSystemAdmin(req);

    if (!FIKEN_API_TOKEN) {
      return json({success:false,error:"FIKEN_API_TOKEN mangler."},500);
    }

    const body = await req.json().catch(()=>({}));
    const action = String(body.action || "setup");

    if (action === "setup") {
      return json(await getSetup(admin));
    }

    if (action !== "create_test_invoice") {
      return json({success:false,error:"Ukjent handling."},400);
    }

    const personId = String(body.personId || "");
    const description = String(body.description || "").trim();
    const amountCents = Math.round(Number(body.amountCents));
    const dueDays = Math.max(1,Math.min(90,Math.round(Number(body.dueDays || 14))));
    const bankAccountCode = String(body.bankAccountCode || "").trim();
    const incomeAccount = String(body.incomeAccount || "").trim();
    const vatType = "NONE";
    const sendMode = String(body.sendMode || "efaktura_first");

    if (!personId || !description || !Number.isFinite(amountCents) || amountCents <= 0) {
      return json({success:false,error:"Person, beskrivelse og gyldig beløp må fylles ut."},400);
    }

    if (!bankAccountCode || !incomeAccount) {
      return json({success:false,error:"Velg bankkonto og inntektskonto."},400);
    }

    const validVat = new Set([
      "HIGH","MEDIUM","LOW","EXEMPT","EXEMPT_IMPORT_EXPORT",
      "EXEMPT_REVERSE","OUTSIDE","NONE"
    ]);

    if (!validVat.has(vatType)) {
      return json({success:false,error:"Ugyldig MVA-type."},400);
    }

    const {data:person,error:personError} = await admin
      .from("persons")
      .select("id,full_name,email,phone")
      .eq("id",personId)
      .maybeSingle();

    if (personError || !person) {
      return json({success:false,error:"Personen finnes ikke."},404);
    }

    const {data:contact,error:contactError} = await admin
      .from("fiken_contacts")
      .select("fiken_contact_id,name,email")
      .eq("person_id",personId)
      .eq("inactive",false)
      .maybeSingle();

    if (contactError || !contact) {
      return json({
        success:false,
        error:"Personen er ikke koblet til en aktiv Fiken-kontakt. Kjør synkronisering først.",
      },400);
    }

    const uuid = crypto.randomUUID();
    const issueDate = new Date().toISOString().slice(0,10);
    const dueDate = datePlusDays(dueDays);

    const invoicePayload = {
      uuid,
      issueDate,
      dueDate,
      customerId:Number(contact.fiken_contact_id),
      bankAccountCode,
      currency:"NOK",
      cash:false,
      invoiceText:"Opprettet fra Oslo Førerhundklubb medlemsportal.",
      lines:[{
        quantity:1,
        unitPrice:amountCents,
        vatType,
        productName:description,
        description,
        incomeAccount,
      }],
    };

    const created = await fiken("/invoices",{
      method:"POST",
      body:JSON.stringify(invoicePayload),
    });

    if (!created.ok) {
      return json({
        success:false,
        error:`Fiken avviste fakturaen (${created.status}): ${created.text.slice(0,600)}`,
      },502);
    }

    const invoiceId = extractIdFromLocation(created.location);

    if (!invoiceId) {
      return json({
        success:false,
        error:"Fakturaen ble opprettet, men Fiken returnerte ikke lesbar invoiceId. Kontroller Fiken før du prøver igjen.",
      },502);
    }

    await new Promise(resolve=>setTimeout(resolve,300));

    const invoiceResult = await fiken(`/invoices/${invoiceId}`,{method:"GET"});

    const invoice = invoiceResult.ok ? invoiceResult.data : null;
    let dispatchMethod = "ikke_sendt";
    let fallbackUsed = false;
    let sendError = null;

    if (sendMode !== "create_only") {
      /*
       * Fikens API bruker fremdeles dispatch-koden "vipps".
       * Fikens brukerdokumentasjon sier at "Vipps eFaktura" nå heter eFaktura.
       * Vi prøver derfor denne først. Ved avvisning faller vi tilbake til e-post.
       */
      if (sendMode === "efaktura_first") {
        await new Promise(resolve=>setTimeout(resolve,300));

        const efaktura = await fiken("/invoices/send",{
          method:"POST",
          body:JSON.stringify({
            invoiceId,
            method:["auto"],
            includeDocumentAttachments:false,
            recipientName:person.full_name || contact.name || undefined,
            recipientEmail:person.email || contact.email || undefined,
            mobileNumber:normalizeNorwegianMobile(person.phone || contact.phone) || undefined,
          }),
        });

        if (efaktura.ok) {
          dispatchMethod = "auto";
        } else {
          fallbackUsed = true;

          if (!person.email && !contact.email) {
            sendError =
              `eFaktura ble ikke akseptert (${efaktura.status}), og personen mangler e-post for fallback.`;
          } else {
            await new Promise(resolve=>setTimeout(resolve,300));

            const emailSend = await fiken("/invoices/send",{
              method:"POST",
              body:JSON.stringify({
                invoiceId,
                method:["email"],
                includeDocumentAttachments:true,
                recipientName:person.full_name || contact.name || undefined,
                recipientEmail:person.email || contact.email,
                emailSendOption:"auto",
              }),
            });

            if (emailSend.ok) {
              dispatchMethod = "email";
            } else {
              sendError =
                `eFaktura feilet (${efaktura.status}) og e-post feilet (${emailSend.status}): ${emailSend.text.slice(0,300)}`;
            }
          }
        }
      } else if (sendMode === "email") {
        if (!person.email && !contact.email) {
          sendError = "Personen mangler e-postadresse.";
        } else {
          await new Promise(resolve=>setTimeout(resolve,300));

          const emailSend = await fiken("/invoices/send",{
            method:"POST",
            body:JSON.stringify({
              invoiceId,
              method:["email"],
              includeDocumentAttachments:true,
              recipientName:person.full_name || contact.name || undefined,
              recipientEmail:person.email || contact.email,
              emailSendOption:"auto",
            }),
          });

          if (emailSend.ok) {
            dispatchMethod = "email";
          } else {
            sendError =
              `E-postutsendelse feilet (${emailSend.status}): ${emailSend.text.slice(0,300)}`;
          }
        }
      }
    }

    const gross =
      invoice?.gross ??
      invoice?.grossInNok ??
      amountCents;

    const {error:saveError} = await admin
      .from("fiken_invoices")
      .upsert({
        fiken_invoice_id:invoiceId,
        fiken_invoice_number:invoice?.invoiceNumber || null,
        fiken_customer_id:Number(contact.fiken_contact_id),
        person_id:personId,
        issue_date:invoice?.issueDate || issueDate,
        due_date:invoice?.dueDate || dueDate,
        settled:false,
        status:"outstanding",
        amount_gross_cents:gross,
        order_reference:invoice?.orderReference || null,
        invoice_source:"test",
        raw_json:invoice || {invoiceId},
        synced_at:new Date().toISOString(),
        dispatch_method:dispatchMethod,
        dispatch_fallback_used:fallbackUsed,
        sent_at:dispatchMethod !== "ikke_sendt" ? new Date().toISOString() : null,
        created_by_portal:true,
      },{onConflict:"fiken_invoice_id"});

    if (saveError) {
      console.error("Faktura opprettet i Fiken, men lokal lagring feilet:",saveError);
    }

    return json({
      success:true,
      invoiceId,
      invoiceNumber:invoice?.invoiceNumber || null,
      dueDate:invoice?.dueDate || dueDate,
      grossCents:gross,
      dispatchMethod,
      fallbackUsed,
      sendError,
      kid:invoice?.kid || null,
    });

  } catch(error) {
    console.error("fiken-create-invoice:",error);

    const message = error instanceof Error ? error.message : String(error);
    const auth = message.startsWith("AUTH:");

    return json({
      success:false,
      error:auth ? message.slice(5) : message,
    },auth ? 403 : 500);
  }
});
