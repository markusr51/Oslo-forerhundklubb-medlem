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

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{...corsHeaders,"Content-Type":"application/json"},
  });
}

function normalizeNorwegianMobile(value:any){
  let s=String(value||"").trim().replace(/[()\s.-]/g,"");
  if(s.startsWith("0047")) s=s.slice(4);
  if(s.startsWith("+47")) s=s.slice(3);
  const digits=s.replace(/\D/g,"");
  return /^\d{8}$/.test(digits) ? digits : null;
}

async function pause(){
  await new Promise(resolve=>setTimeout(resolve,300));
}

async function fiken(path:string,options:any={}){
  const response=await fetch(BASE+path,{
    ...options,
    headers:{
      Authorization:`Bearer ${FIKEN_API_TOKEN}`,
      Accept:"application/json",
      "Content-Type":"application/json",
      "X-Request-ID":crypto.randomUUID(),
      ...(options.headers||{}),
    },
  });

  const text=await response.text();

  return {
    ok:response.ok,
    status:response.status,
    text,
    data:text?(()=>{try{return JSON.parse(text)}catch{return null}})():null,
    location:response.headers.get("Location"),
  };
}

function idFromLocation(location:string|null){
  if(!location) return null;
  const parts=location.split("/").filter(Boolean);
  const n=Number(parts[parts.length-1]);
  return Number.isFinite(n)?n:null;
}

function datePlusDays(days:number){
  const d=new Date();
  d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}

async function requireSystemAdmin(req:Request){
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer ")) throw new Error("AUTH:Ikke innlogget.");

  const uc=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{
    global:{headers:{Authorization:auth}},
    auth:{persistSession:false,autoRefreshToken:false},
  });

  const admin=createClient(SUPABASE_URL,SECRET_KEY,{
    auth:{persistSession:false,autoRefreshToken:false},
  });

  const {data:{user},error:ue}=await uc.auth.getUser();
  if(ue||!user) throw new Error("AUTH:Ugyldig innlogging.");

  const {data:au,error:ae}=await admin.from("app_users")
    .select("app_role,active").eq("user_id",user.id).maybeSingle();

  if(ae||!au||au.active!==true||au.app_role!=="system_admin"){
    throw new Error("AUTH:Bare systemadministrator kan fakturere via Fiken.");
  }

  return {admin,user};
}

async function loadSetup(admin:any){
  const banks=await fiken("/bankAccounts?page=0&pageSize=100",{method:"GET"});
  if(!banks.ok) throw new Error(`Kunne ikke hente bankkontoer (${banks.status}): ${banks.text.slice(0,300)}`);

  await pause();

  const accounts=await fiken("/accounts?fromAccount=3000&toAccount=3999&page=0&pageSize=100",{method:"GET"});
  if(!accounts.ok) throw new Error(`Kunne ikke hente inntektskontoer (${accounts.status}): ${accounts.text.slice(0,300)}`);

  const {data:persons,error:pe}=await admin.from("persons")
    .select("id,full_name,email,phone,membership_status,person_roles(role_id,is_active,roles(id,name))")
    .eq("membership_status","active")
    .order("full_name");
  if(pe) throw pe;

  const {data:links,error:le}=await admin.from("fiken_contacts")
    .select("fiken_contact_id,person_id,name,email,phone,inactive")
    .eq("inactive",false);
  if(le) throw le;

  const linkByPerson=new Map((links||[]).filter((x:any)=>x.person_id).map((x:any)=>[x.person_id,x]));

  return {
    success:true,
    people:(persons||[]).map((p:any)=>({
      ...p,
      fiken_contact_id:linkByPerson.get(p.id)?.fiken_contact_id||null,
      fiken_linked:!!linkByPerson.get(p.id),
      roles:(p.person_roles||[])
        .filter((r:any)=>r.is_active===true && r.roles)
        .map((r:any)=>({id:r.roles.id,name:r.roles.name})),
    })),
    bankAccounts:(Array.isArray(banks.data)?banks.data:[])
      .filter((b:any)=>b?.type==="normal")
      .map((b:any)=>({
        name:b.name||"",
        accountCode:b.accountCode||"",
        bankAccountNumber:b.bankAccountNumber||"",
      })),
    incomeAccounts:(Array.isArray(accounts.data)?accounts.data:[])
      .map((a:any)=>({code:a.code||"",name:a.name||""})),
  };
}

async function sendAuto(invoiceId:number,person:any,contact:any){
  const name=person?.full_name||contact?.name||undefined;
  const email=person?.email||contact?.email||undefined;
  const phone=normalizeNorwegianMobile(person?.phone||contact?.phone);

  const autoBody={
    invoiceId,
    method:["auto"],
    includeDocumentAttachments:false,
    recipientName:name,
    recipientEmail:email,
    mobileNumber:phone||undefined,
  };

  const auto=await fiken("/invoices/send",{
    method:"POST",
    body:JSON.stringify(autoBody),
  });

  if(auto.ok){
    return {method:"auto",fallback:false};
  }

  if(!email){
    return {
      method:"ikke_sendt",
      fallback:false,
      error:`AUTO feilet (${auto.status}) og mottakeren mangler e-post: ${auto.text.slice(0,250)}`
    };
  }

  await pause();

  const emailSend=await fiken("/invoices/send",{
    method:"POST",
    body:JSON.stringify({
      invoiceId,
      method:["email"],
      includeDocumentAttachments:true,
      recipientName:name,
      recipientEmail:email,
      emailSendOption:"auto",
    }),
  });

  return emailSend.ok
    ? {method:"email",fallback:true}
    : {
        method:"ikke_sendt",
        fallback:true,
        error:`AUTO feilet (${auto.status}) og e-post feilet (${emailSend.status}): ${emailSend.text.slice(0,250)}`
      };
}

async function createOneInvoice(admin:any,args:any){
  const {
    person,
    contact,
    description,
    amountCents,
    dueDays,
    bankAccountCode,
    incomeAccount,
    vatType,
    sendMode,
    invoiceSource,
    membershipYear,
    eventId,
  }=args;

  const issueDate=new Date().toISOString().slice(0,10);
  const dueDate=datePlusDays(dueDays);

  const payload={
    uuid:crypto.randomUUID(),
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

  const created=await fiken("/invoices",{
    method:"POST",
    body:JSON.stringify(payload),
  });

  if(!created.ok){
    throw new Error(`Fiken avviste fakturaen (${created.status}): ${created.text.slice(0,450)}`);
  }

  const invoiceId=idFromLocation(created.location);
  if(!invoiceId){
    throw new Error("Fiken opprettet faktura, men returnerte ikke lesbar invoiceId.");
  }

  await pause();

  const fetched=await fiken(`/invoices/${invoiceId}`,{method:"GET"});
  const invoice=fetched.ok?fetched.data:null;

  let dispatch={method:"ikke_sendt",fallback:false,error:null};

  if(sendMode==="auto"){
    await pause();
    dispatch=await sendAuto(invoiceId,person,contact);
  } else if(sendMode==="email"){
    const email=person?.email||contact?.email;
    if(!email){
      dispatch={method:"ikke_sendt",fallback:false,error:"Mottakeren mangler e-post."};
    } else {
      await pause();
      const r=await fiken("/invoices/send",{
        method:"POST",
        body:JSON.stringify({
          invoiceId,
          method:["email"],
          includeDocumentAttachments:true,
          recipientName:person?.full_name||contact?.name||undefined,
          recipientEmail:email,
          emailSendOption:"auto",
        }),
      });
      dispatch=r.ok
        ? {method:"email",fallback:false,error:null}
        : {method:"ikke_sendt",fallback:false,error:`E-post feilet (${r.status}): ${r.text.slice(0,250)}`};
    }
  }

  const gross=
    invoice?.gross ??
    invoice?.grossInNok ??
    amountCents;

  const {error:saveError}=await admin.from("fiken_invoices").upsert({
    fiken_invoice_id:invoiceId,
    fiken_invoice_number:invoice?.invoiceNumber||null,
    fiken_customer_id:Number(contact.fiken_contact_id),
    person_id:person.id,
    issue_date:invoice?.issueDate||issueDate,
    due_date:invoice?.dueDate||dueDate,
    settled:false,
    status:"unpaid",
    amount_gross_cents:gross,
    order_reference:invoice?.orderReference||null,
    invoice_source:invoiceSource,
    event_id:eventId||null,
    membership_year:membershipYear||null,
    raw_json:invoice||{invoiceId},
    synced_at:new Date().toISOString(),
    dispatch_method:dispatch.method,
    dispatch_fallback_used:dispatch.fallback===true,
    sent_at:dispatch.method!=="ikke_sendt" ? new Date().toISOString() : null,
    created_by_portal:true,
  },{onConflict:"fiken_invoice_id"});

  if(saveError){
    console.error("Faktura opprettet i Fiken, lokal lagring feilet:",saveError);
  }

  return {
    invoiceId,
    invoiceNumber:invoice?.invoiceNumber||null,
    amountCents:gross,
    dueDate:invoice?.dueDate||dueDate,
    dispatchMethod:dispatch.method,
    fallbackUsed:dispatch.fallback===true,
    sendError:dispatch.error||null,
  };
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return json({success:false,error:"Kun POST er tillatt."},405);

  try{
    const {admin,user}=await requireSystemAdmin(req);
    if(!FIKEN_API_TOKEN) return json({success:false,error:"FIKEN_API_TOKEN mangler."},500);

    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"setup");

    if(action==="setup"){
      return json(await loadSetup(admin));
    }

    const runType=action==="membership_run"
      ? "membership"
      : action==="event_run"
        ? "event"
        : null;

    if(!runType){
      return json({success:false,error:"Ukjent handling."},400);
    }

    const amountCents=Math.round(Number(body.amountCents));
    const dueDays=Math.max(1,Math.min(90,Math.round(Number(body.dueDays||14))));
    const description=String(body.description||"").trim();
    const bankAccountCode=String(body.bankAccountCode||"").trim();
    const incomeAccount=String(body.incomeAccount||"").trim();
    const vatType="NONE";
    const sendMode=String(body.sendMode||"auto");

    if(!description||!Number.isFinite(amountCents)||amountCents<=0||!bankAccountCode||!incomeAccount){
      return json({success:false,error:"Beskrivelse, beløp, bankkonto og inntektskonto må fylles ut."},400);
    }

    const requestedIds=Array.isArray(body.personIds)
      ? [...new Set(body.personIds.map((x:any)=>String(x)).filter(Boolean))]
      : [];

    if(!requestedIds.length){
      return json({success:false,error:"Ingen personer er valgt."},400);
    }

    let membershipYear:number|null=null;
    let eventId:string|null=null;
    let guestPricing:string|null=null;
    let eligiblePeople:any[]=[];

    const {data:people,error:peopleError}=await admin.from("persons")
      .select("id,full_name,email,phone,membership_status")
      .in("id",requestedIds);
    if(peopleError) throw peopleError;

    if(runType==="membership"){
      membershipYear=Math.round(Number(body.membershipYear));
      if(!Number.isFinite(membershipYear)||membershipYear<2000||membershipYear>2100){
        return json({success:false,error:"Ugyldig kontingentår."},400);
      }

      eligiblePeople=(people||[]).filter((p:any)=>p.membership_status==="active");
    } else {
      eventId=String(body.eventId||"");
      guestPricing=String(body.guestPricing||"registration");

      const {data:participants,error:partError}=await admin.from("event_participants")
        .select("person_id,status,guest_count")
        .eq("event_id",eventId)
        .eq("status","attending")
        .in("person_id",requestedIds);
      if(partError) throw partError;

      const partMap=new Map((participants||[]).map((p:any)=>[p.person_id,p]));
      eligiblePeople=(people||[])
        .filter((p:any)=>partMap.has(p.id))
        .map((p:any)=>({...p,__participant:partMap.get(p.id)}));
    }

    const {data:links,error:linksError}=await admin.from("fiken_contacts")
      .select("fiken_contact_id,person_id,name,email,phone,inactive")
      .in("person_id",eligiblePeople.map((p:any)=>p.id))
      .eq("inactive",false);
    if(linksError) throw linksError;

    const linkMap=new Map((links||[]).map((x:any)=>[x.person_id,x]));

    const {data:run,error:runError}=await admin.from("fiken_billing_runs")
      .insert({
        run_type:runType,
        membership_year:membershipYear,
        event_id:eventId,
        description,
        unit_amount_cents:amountCents,
        due_days:dueDays,
        send_mode:sendMode,
        bank_account_code:bankAccountCode,
        income_account:incomeAccount,
        vat_type:vatType,
        guest_pricing:guestPricing,
        created_by:user.id,
        status:"running",
      })
      .select("id")
      .single();
    if(runError) throw runError;

    const summary={
      requested:requestedIds.length,
      eligible:eligiblePeople.length,
      created:0,
      skippedDuplicate:0,
      skippedNoFiken:0,
      failed:0,
      sentAuto:0,
      sentEmail:0,
      notSent:0,
    };

    const results:any[]=[];

    for(const person of eligiblePeople){
      const contact=linkMap.get(person.id);

      if(!contact){
        summary.skippedNoFiken++;
        results.push({
          personId:person.id,
          name:person.full_name,
          status:"skipped_no_fiken",
          message:"Ingen koblet Fiken-kontakt.",
        });

        await admin.from("fiken_billing_run_items").insert({
          run_id:run.id,
          person_id:person.id,
          event_id:eventId,
          membership_year:membershipYear,
          amount_cents:amountCents,
          item_status:"skipped_no_fiken",
          error_message:"Ingen koblet Fiken-kontakt.",
        });
        continue;
      }

      let duplicateQuery=admin.from("fiken_invoices")
        .select("fiken_invoice_id,fiken_invoice_number")
        .eq("person_id",person.id);

      if(runType==="membership"){
        duplicateQuery=duplicateQuery
          .eq("invoice_source","membership")
          .eq("membership_year",membershipYear);
      } else {
        duplicateQuery=duplicateQuery
          .eq("invoice_source","event")
          .eq("event_id",eventId);
      }

      const {data:existing,error:dupError}=await duplicateQuery.maybeSingle();
      if(dupError) throw dupError;

      if(existing){
        summary.skippedDuplicate++;
        results.push({
          personId:person.id,
          name:person.full_name,
          status:"skipped_duplicate",
          invoiceNumber:existing.fiken_invoice_number,
        });

        await admin.from("fiken_billing_run_items").insert({
          run_id:run.id,
          person_id:person.id,
          event_id:eventId,
          membership_year:membershipYear,
          amount_cents:amountCents,
          fiken_invoice_id:existing.fiken_invoice_id,
          fiken_invoice_number:existing.fiken_invoice_number,
          item_status:"skipped_duplicate",
        });
        continue;
      }

      const finalAmount=
        runType==="event" &&
        guestPricing==="per_attendee"
          ? amountCents * (1 + Number(person.__participant?.guest_count||0))
          : amountCents;

      try{
        const created=await createOneInvoice(admin,{
          person,
          contact,
          description,
          amountCents:finalAmount,
          dueDays,
          bankAccountCode,
          incomeAccount,
          vatType,
          sendMode,
          invoiceSource:runType,
          membershipYear,
          eventId,
        });

        summary.created++;
        if(created.dispatchMethod==="auto") summary.sentAuto++;
        else if(created.dispatchMethod==="email") summary.sentEmail++;
        else summary.notSent++;

        results.push({
          personId:person.id,
          name:person.full_name,
          status:"created",
          ...created,
        });

        await admin.from("fiken_billing_run_items").insert({
          run_id:run.id,
          person_id:person.id,
          event_id:eventId,
          membership_year:membershipYear,
          amount_cents:finalAmount,
          fiken_invoice_id:created.invoiceId,
          fiken_invoice_number:created.invoiceNumber,
          item_status:created.sendError ? "created_send_warning" : "created",
          error_message:created.sendError,
        });
      }catch(error){
        summary.failed++;
        const message=error instanceof Error?error.message:String(error);

        results.push({
          personId:person.id,
          name:person.full_name,
          status:"failed",
          message,
        });

        await admin.from("fiken_billing_run_items").insert({
          run_id:run.id,
          person_id:person.id,
          event_id:eventId,
          membership_year:membershipYear,
          amount_cents:finalAmount,
          item_status:"failed",
          error_message:message.slice(0,1000),
        });
      }

      await pause();
    }

    await admin.from("fiken_billing_runs").update({
      status:summary.failed ? "completed_with_errors" : "completed",
      summary_json:summary,
      completed_at:new Date().toISOString(),
    }).eq("id",run.id);

    return json({
      success:true,
      runId:run.id,
      summary,
      results,
    });

  }catch(error){
    console.error("fiken-billing-runs:",error);
    const m=error instanceof Error?error.message:String(error);
    const auth=m.startsWith("AUTH:");
    return json({success:false,error:auth?m.slice(5):m},auth?403:500);
  }
});
