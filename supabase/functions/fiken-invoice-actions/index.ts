import { createOsloClient as createClient } from "../_shared/portal-scope.ts";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SECRET_KEYS=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
const PUBLISHABLE_KEYS=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");
const SECRET_KEY=SECRET_KEYS.default||"";
const PUBLISHABLE_KEY=PUBLISHABLE_KEYS.default||Deno.env.get("SUPABASE_ANON_KEY")||"";
const FIKEN_API_TOKEN=Deno.env.get("FIKEN_API_TOKEN")||"";

const COMPANY_SLUG="oslo-forerhundklubb";
const BASE=`https://api.fiken.no/api/v2/companies/${COMPANY_SLUG}`;

const corsHeaders={
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
    throw new Error("AUTH:Bare systemadministrator kan utføre Fiken-handlingen.");
  }
  return admin;
}

async function fiken(path:string,options:any={}){
  const response=await fetch(BASE+path,{
    ...options,
    headers:{
      Authorization:`Bearer ${FIKEN_API_TOKEN}`,
      Accept:"application/json",
      "Content-Type":"application/json",
      "Fiken-Request-Id":crypto.randomUUID(),
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

function normalizeNorwegianMobile(value:any){
  let s=String(value||"").trim().replace(/[()\s.-]/g,"");
  if(s.startsWith("0047")) s=s.slice(4);
  if(s.startsWith("+47")) s=s.slice(3);
  const digits=s.replace(/\D/g,"");
  if(/^\d{8}$/.test(digits)) return digits;
  return null;
}

async function getInvoiceContext(admin:any,invoiceId:number){
  const {data:inv,error:ie}=await admin.from("fiken_invoices")
    .select("fiken_invoice_id,fiken_invoice_number,fiken_customer_id,person_id,settled,status,amount_gross_cents,due_date,credited_at")
    .eq("fiken_invoice_id",invoiceId).maybeSingle();
  if(ie||!inv) throw new Error("Fakturaen finnes ikke lokalt. Kjør synkronisering først.");

  let person=null;
  if(inv.person_id){
    const {data,error}=await admin.from("persons")
      .select("id,full_name,email,phone").eq("id",inv.person_id).maybeSingle();
    if(error) throw error;
    person=data;
  }

  let contact=null;
  if(inv.fiken_customer_id!=null){
    const {data,error}=await admin.from("fiken_contacts")
      .select("fiken_contact_id,name,email,phone,raw_json,person_id")
      .eq("fiken_contact_id",inv.fiken_customer_id).maybeSingle();
    if(error) throw error;
    contact=data;
  }

  return {inv,person,contact};
}

async function sendInvoice(admin:any,invoiceId:number,mode:string){
  const {person,contact}=await getInvoiceContext(admin,invoiceId);
  const name=person?.full_name||contact?.name||undefined;
  const email=person?.email||contact?.email||undefined;
  const phone=normalizeNorwegianMobile(person?.phone||contact?.phone);

  if(mode==="email"){
    if(!email) return {success:false,error:"Mottakeren mangler e-postadresse."};
    const r=await fiken("/invoices/send",{
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
    return r.ok
      ? {success:true,dispatchMethod:"email",fallbackUsed:false}
      : {success:false,error:`Fiken avviste e-postutsendelsen (${r.status}): ${r.text.slice(0,400)}`};
  }

  if(!phone){
    if(!email) return {success:false,error:"Mottakeren mangler gyldig mobilnummer og e-post."};
    const er=await fiken("/invoices/send",{
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
    return er.ok
      ? {success:true,dispatchMethod:"email",fallbackUsed:true,warning:"Ingen gyldig mobil for eFaktura. Sendt på e-post."}
      : {success:false,error:`Ingen gyldig mobil for eFaktura, og e-post feilet (${er.status}).`};
  }

  const vr=await fiken("/invoices/send",{
    method:"POST",
    body:JSON.stringify({
      invoiceId,
      method:["auto"],
      includeDocumentAttachments:false,
      recipientName:name,
      recipientEmail:email,
      mobileNumber:phone,
    }),
  });

  if(vr.ok){
    return {success:true,dispatchMethod:"auto",fallbackUsed:false,mobileNumber:phone};
  }

  if(!email){
    return {
      success:false,
      error:`eFaktura ble avvist av Fiken (${vr.status}), og mottakeren mangler e-post for fallback: ${vr.text.slice(0,300)}`
    };
  }

  await new Promise(r=>setTimeout(r,300));

  const er=await fiken("/invoices/send",{
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

  return er.ok
    ? {
        success:true,
        dispatchMethod:"email",
        fallbackUsed:true,
        warning:`eFaktura ble avvist av Fiken (${vr.status}). Fakturaen ble sendt på e-post i stedet.`,
        efakturaError:vr.text.slice(0,300),
      }
    : {
        success:false,
        error:`eFaktura feilet (${vr.status}) og e-post feilet (${er.status}): ${er.text.slice(0,300)}`
      };
}

async function sendCreditNote(creditNoteId:number,ctx:any){
  const name=ctx.person?.full_name||ctx.contact?.name||undefined;
  const email=ctx.person?.email||ctx.contact?.email||undefined;
  const phone=normalizeNorwegianMobile(ctx.person?.phone||ctx.contact?.phone);

  if(phone){
    const vr=await fiken("/creditNotes/send",{
      method:"POST",
      body:JSON.stringify({
        creditNoteId,
        method:["auto"],
        includeDocumentAttachments:false,
        recipientName:name,
        recipientEmail:email,
        mobileNumber:phone,
      }),
    });
    if(vr.ok) return {method:"efaktura",fallback:false};
  }

  if(email){
    await new Promise(r=>setTimeout(r,300));
    const er=await fiken("/creditNotes/send",{
      method:"POST",
      body:JSON.stringify({
        creditNoteId,
        method:["email"],
        includeDocumentAttachments:true,
        recipientName:name,
        recipientEmail:email,
        emailSendOption:"auto",
      }),
    });
    if(er.ok) return {method:["email"],fallback:true};
  }

  return {method:"ikke_sendt",fallback:false};
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return json({success:false,error:"Kun POST er tillatt."},405);

  try{
    const admin=await requireSystemAdmin(req);
    if(!FIKEN_API_TOKEN) return json({success:false,error:"FIKEN_API_TOKEN mangler."},500);

    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"");

    if(action==="resend"){
      const invoiceId=Number(body.invoiceId);
      if(!Number.isFinite(invoiceId)) return json({success:false,error:"Ugyldig invoiceId."},400);

      const result=await sendInvoice(admin,invoiceId,String(body.mode||"efaktura_first"));

      if(result.success){
        await admin.from("fiken_invoices").update({
          dispatch_method:result.dispatchMethod,
          dispatch_fallback_used:result.fallbackUsed===true,
          sent_at:new Date().toISOString(),
        }).eq("fiken_invoice_id",invoiceId);
      }

      return json(result,result.success?200:502);
    }

    if(action==="credit_full"){
      const invoiceId=Number(body.invoiceId);
      if(!Number.isFinite(invoiceId)) return json({success:false,error:"Ugyldig invoiceId."},400);

      const ctx=await getInvoiceContext(admin,invoiceId);

      if(ctx.inv.credited_at){
        return json({success:false,error:"Denne fakturaen er allerede markert som kreditert i portalen."},409);
      }

      const issueDate=new Date().toISOString().slice(0,10);
      const cr=await fiken("/creditNotes/full",{
        method:"POST",
        body:JSON.stringify({
          issueDate,
          invoiceId,
          creditNoteText:String(body.text||"Full kreditering fra medlemsportal").slice(0,500),
        }),
      });

      if(!cr.ok){
        return json({
          success:false,
          error:`Fiken avviste krediteringen (${cr.status}): ${cr.text.slice(0,500)}`
        },502);
      }

      const creditNoteId=idFromLocation(cr.location);
      if(!creditNoteId){
        return json({
          success:false,
          error:"Kreditnota ble opprettet, men Fiken returnerte ikke lesbar creditNoteId. Kontroller Fiken før nytt forsøk."
        },502);
      }

      await new Promise(r=>setTimeout(r,300));

      const fetched=await fiken(`/creditNotes/${creditNoteId}`,{method:"GET"});
      const credit=fetched.ok?fetched.data:null;

      let dispatch={method:"ikke_sendt",fallback:false};
      if(body.send!==false){
        await new Promise(r=>setTimeout(r,300));
        dispatch=await sendCreditNote(creditNoteId,ctx);
      }

      await admin.from("fiken_invoices").update({
        fiken_credit_note_id:creditNoteId,
        fiken_credit_note_number:credit?.creditNoteNumber||null,
        credited_at:new Date().toISOString(),
      }).eq("fiken_invoice_id",invoiceId);

      return json({
        success:true,
        creditNoteId,
        creditNoteNumber:credit?.creditNoteNumber||null,
        dispatchMethod:dispatch.method,
        fallbackUsed:dispatch.fallback,
      });
    }

    if(action==="link_contact"){
      const personId=String(body.personId||"");
      const contactId=Number(body.fikenContactId);
      if(!personId||!Number.isFinite(contactId)){
        return json({success:false,error:"Person eller Fiken-kontakt mangler."},400);
      }

      const {data:person,error:pe}=await admin.from("persons")
        .select("id,full_name,email,phone").eq("id",personId).maybeSingle();
      if(pe||!person) return json({success:false,error:"Personen finnes ikke."},404);

      const {data:fc,error:fce}=await admin.from("fiken_contacts")
        .select("fiken_contact_id,person_id").eq("fiken_contact_id",contactId).maybeSingle();
      if(fce||!fc) return json({success:false,error:"Fiken-kontakten finnes ikke lokalt."},404);

      if(fc.person_id && fc.person_id!==personId){
        return json({success:false,error:"Fiken-kontakten er allerede koblet til en annen person."},409);
      }

      const {error:ue}=await admin.from("fiken_contacts")
        .update({person_id:personId,synced_at:new Date().toISOString()})
        .eq("fiken_contact_id",contactId);
      if(ue) throw ue;

      await admin.from("fiken_invoices")
        .update({person_id:personId})
        .eq("fiken_customer_id",contactId)
        .is("person_id",null);

      return json({success:true});
    }

    return json({success:false,error:"Ukjent handling."},400);

  }catch(error){
    console.error("fiken-invoice-actions:",error);
    const m=error instanceof Error?error.message:String(error);
    const auth=m.startsWith("AUTH:");
    return json({success:false,error:auth?m.slice(5):m},auth?403:500);
  }
});
