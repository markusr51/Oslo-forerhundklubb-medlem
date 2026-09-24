import { createOsloClient as createClient } from "../_shared/portal-scope.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const SECRET_KEY = SECRET_KEYS.default || "";
const FIKEN_API_TOKEN = Deno.env.get("FIKEN_API_TOKEN") || "";

const COMPANY_SLUG = "oslo-forerhundklubb";
const BASE = `https://api.fiken.no/api/v2/companies/${COMPANY_SLUG}`;

const corsHeaders = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-portal-club",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{...corsHeaders,"Content-Type":"application/json"},
  });
}

async function fikenGet(path:string){
  const response = await fetch(BASE+path,{
    method:"GET",
    headers:{
      Authorization:`Bearer ${FIKEN_API_TOKEN}`,
      Accept:"application/json",
      "Fiken-Request-Id":crypto.randomUUID(),
    },
  });
  const text = await response.text();
  if(!response.ok){
    throw new Error(`Fiken ${response.status} på ${path}: ${text.slice(0,500)}`);
  }
  return {data:text?JSON.parse(text):[],headers:response.headers};
}

async function fetchAll(path:string){
  const items:any[]=[];
  let page=0;
  while(true){
    const sep=path.includes("?")?"&":"?";
    const result=await fikenGet(`${path}${sep}page=${page}&pageSize=100`);
    const batch=Array.isArray(result.data)?result.data:[];
    items.push(...batch);
    const pageCount=Number(result.headers.get("Fiken-Api-Page-Count")||"1");
    if(page+1>=pageCount || batch.length===0) break;
    page+=1;
    await new Promise(r=>setTimeout(r,300));
  }
  return items;
}

function contactIdOf(c:any){ return c?.contactId ?? c?.id ?? null; }
function invoiceIdOf(i:any){ return i?.invoiceId ?? i?.id ?? null; }
function invoiceNumberOf(i:any){ return i?.invoiceNumber ?? i?.number ?? null; }
function customerIdOf(i:any){
  return i?.customer?.contactId ?? i?.customer?.id ?? i?.customerId ?? null;
}
function grossCentsOf(i:any){
  for(const v of [i?.gross,i?.grossInNok,i?.grossAmount,i?.totalGross,i?.amount,i?.total]){
    if(typeof v==="number" && Number.isFinite(v)) return Math.round(v);
  }
  return null;
}
function isOverdue(i:any){
  if(!i?.dueDate) return false;
  return new Date(`${i.dueDate}T23:59:59`).getTime() < Date.now();
}



Deno.serve(async req => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {headers:corsHeaders});
  }

  if (req.method !== "POST") {
    return json({success:false,error:"Kun POST er tillatt."},405);
  }

  const suppliedKey = req.headers.get("apikey") || "";

  if (!SECRET_KEY || suppliedKey !== SECRET_KEY) {
    return json({
      success:false,
      error:"Ugyldig servernøkkel.",
    },401);
  }

  const admin = createClient(
    SUPABASE_URL,
    SECRET_KEY,
    {
      auth:{
        persistSession:false,
        autoRefreshToken:false,
      },
    }
  );

  try {
    await admin
      .from("integration_sync_status")
      .upsert({
        integration:"fiken",
        last_started_at:new Date().toISOString(),
        last_status:"running",
        last_error:null,
        updated_at:new Date().toISOString(),
      },{
        onConflict:"integration",
      });

    if (!FIKEN_API_TOKEN) {
      throw new Error("FIKEN_API_TOKEN mangler.");
    }

    const contacts=await fetchAll("/contacts");
    const {data:persons,error:pe}=await admin.from("persons")
      .select("id,full_name,email,phone");
    if(pe) throw pe;

    const byEmail=new Map((persons||[]).filter((p:any)=>p.email)
      .map((p:any)=>[String(p.email).trim().toLowerCase(),p]));
    const byName=new Map((persons||[]).filter((p:any)=>p.full_name)
      .map((p:any)=>[String(p.full_name).trim().toLowerCase(),p]));

    let linkedContacts=0;

    for(const c of contacts){
      const id=contactIdOf(c);
      if(id==null) continue;
      const email=String(c?.email||"").trim().toLowerCase();
      const name=String(c?.name||"").trim();
      const person=(email?byEmail.get(email):null) || (name?byName.get(name.toLowerCase()):null) || null;
      if(person) linkedContacts++;

      const {error}=await admin.from("fiken_contacts").upsert({
        fiken_contact_id:id,
        person_id:person?.id||null,
        name:name||null,
        email:email||null,
        phone:c?.phoneNumber||c?.phone||null,
        customer_number:c?.customerNumber||null,
        inactive:c?.inactive===true,
        raw_json:c,
        synced_at:new Date().toISOString(),
      },{onConflict:"fiken_contact_id"});
      if(error) throw error;
    }

    await new Promise(r=>setTimeout(r,300));
    const paidInvoices=await fetchAll("/invoices?settled=true");
    await new Promise(r=>setTimeout(r,300));
    const unpaidInvoices=await fetchAll("/invoices?settled=false");

    const allInvoices=[
      ...paidInvoices.map((i:any)=>({...i,__paid:true})),
      ...unpaidInvoices.map((i:any)=>({...i,__paid:false})),
    ];

    const {data:localContacts,error:lce}=await admin.from("fiken_contacts")
      .select("fiken_contact_id,person_id,name,email,phone,raw_json");
    if(lce) throw lce;

    const contactMap=new Map((localContacts||[]).map((c:any)=>[Number(c.fiken_contact_id),c]));
    let linkedInvoices=0, paid=0, unpaid=0, overdue=0;

    for(const i of allInvoices){
      const id=invoiceIdOf(i);
      if(id==null) continue;
      const customerId=customerIdOf(i);
      const fc=customerId!=null?contactMap.get(Number(customerId)):null;
      const personId=fc?.person_id||null;
      if(personId) linkedInvoices++;

      const paidFlag=i.__paid===true;
      const overdueFlag=!paidFlag && isOverdue(i);
      if(paidFlag) paid++;
      else unpaid++;
      if(overdueFlag) overdue++;

      const status=paidFlag?"paid":"unpaid";

      const {error}=await admin.from("fiken_invoices").upsert({
        fiken_invoice_id:id,
        fiken_invoice_number:invoiceNumberOf(i),
        fiken_customer_id:customerId,
        person_id:personId,
        issue_date:i?.issueDate||null,
        due_date:i?.dueDate||null,
        settled:paidFlag,
        status,
        amount_gross_cents:grossCentsOf(i),
        order_reference:i?.orderReference||null,
        raw_json:{...i,__overdue:overdueFlag},
        synced_at:new Date().toISOString(),
      },{onConflict:"fiken_invoice_id"});
      if(error) throw error;
    }

    const {data:overview,error:oe}=await admin.from("fiken_invoices")
      .select("fiken_invoice_id,fiken_invoice_number,fiken_customer_id,person_id,issue_date,due_date,status,settled,amount_gross_cents,order_reference,synced_at,fiken_credit_note_id,fiken_credit_note_number,credited_at,raw_json")
      .order("issue_date",{ascending:false}).limit(100);
    if(oe) throw oe;

    const personIds=[...new Set((overview||[]).map((i:any)=>i.person_id).filter(Boolean))];
    let peopleById=new Map();

    if(personIds.length){
      const {data:ops,error:ope}=await admin.from("persons")
        .select("id,full_name,email,phone").in("id",personIds);
      if(ope) throw ope;
      peopleById=new Map((ops||[]).map((p:any)=>[p.id,p]));
    }

    const recentInvoices=(overview||[]).map((i:any)=>{
      const fc=i.fiken_customer_id!=null?contactMap.get(Number(i.fiken_customer_id)):null;
      const p=peopleById.get(i.person_id);
      const overdueFlag=i.settled!==true &&
        (i.raw_json?.__overdue===true ||
         (!!i.due_date && new Date(`${i.due_date}T23:59:59`).getTime()<Date.now()));

      return {
        ...i,
        payment_status:i.settled===true?"paid":"unpaid",
        overdue:overdueFlag,
        person_name:p?.full_name||null,
        person_email:p?.email||null,
        fiken_contact_id:fc?.fiken_contact_id||i.fiken_customer_id||null,
        customer_name:fc?.name||i.raw_json?.customer?.name||null,
        customer_email:fc?.email||i.raw_json?.customer?.email||null,
        customer_phone:fc?.phone||i.raw_json?.customer?.phoneNumber||null,
      };
    });

    const summary = {
      companySlug: COMPANY_SLUG,
      contacts: {
        total: contacts.length,
        linked: linkedContacts,
      },
      invoices: {
        total: allInvoices.length,
        linked: linkedInvoices,
        paid,
        unpaid,
        overdue,
      },
    };

    await admin
      .from("integration_sync_status")
      .upsert({
        integration: "fiken",
        last_success_at: new Date().toISOString(),
        last_status: "success",
        last_error: null,
        summary_json: summary,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "integration",
      });

    return json({
      success: true,
      ...summary,
    });

  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error("fiken-auto-sync:", message);

    await admin
      .from("integration_sync_status")
      .upsert({
        integration:"fiken",
        last_failed_at:new Date().toISOString(),
        last_status:"failed",
        last_error:message.slice(0,1000),
        updated_at:new Date().toISOString(),
      },{
        onConflict:"integration",
      });

    return json({
      success:false,
      error:message,
    },500);
  }
});
