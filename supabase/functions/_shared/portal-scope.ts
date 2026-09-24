import { createClient as baseClient } from 'npm:@supabase/supabase-js@2';
import { AsyncLocalStorage } from 'node:async_hooks';

type Scope={clubId:string,personId:string,userId:string};
const scopes=new AsyncLocalStorage<Scope>();
const OSLO='00000000-0000-4000-8000-000000000001';
const scopedTables=new Set(["portal_service_contacts", "portal_club_memberships", "admin_notifications", "communication_history", "email_campaigns", "email_messages", "event_automation_rules", "event_documents", "event_email_reply_tokens", "event_notes", "event_participants", "event_people", "event_registration_answers", "event_registration_fields", "event_template_automations", "event_template_documents", "event_templates", "events", "fiken_billing_run_items", "fiken_billing_runs", "fiken_contacts", "fiken_invoices", "form_answers", "form_question_options", "form_questions", "form_recipients", "form_responses", "forms", "general_expenses", "group_members", "groups", "helper_entries", "helper_expenses", "helper_rates", "helper_requests", "integration_sync_status", "library_documents", "library_folder_permissions", "library_folders", "person_roles", "roles", "sms_campaigns", "sms_messages", "sms_replies"]);
const secret=()=>Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').service_role||JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;

// Every query and mutation is scoped, including calls made with service_role.
// Parent/reference validation is also enforced by database triggers.
export function scopeDatabase(client:any,clubId:string){
 return new Proxy(client,{get(target,property){
  if(property!=='from'){const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;}
  return (requested:string)=>{
   const table=requested==='persons'?'portal_scoped_members':requested==='app_users'?'portal_club_app_users':requested;
   const builder=target.from(table);
   if(!scopedTables.has(table)&&table!=='portal_scoped_members'&&table!=='portal_club_app_users')return builder;
   return new Proxy(builder,{get(query,method){
    const fn=Reflect.get(query,method);
    if(requested==='app_users'&&['insert','upsert','update','delete'].includes(String(method)))return (...args:any[])=>target.from('app_users')[method](...args);
    if(['select','update','delete'].includes(String(method)))return (...args:any[])=>fn.apply(query,args).eq('club_id',clubId);
    if(['insert','upsert'].includes(String(method)))return (input:any,...args:any[])=>{
     const withClub=(row:any)=>{if(row.club_id&&row.club_id!==clubId)throw Error('Klubben i registreringen samsvarer ikke med valgt klubb.');return {...row,club_id:clubId};};
     return fn.call(query,Array.isArray(input)?input.map(withClub):withClub(input),...args);
    };
    return typeof fn==='function'?fn.bind(query):fn;
   }});
  };
 }});
}
export function createClient(...args:any[]){
 const scope=scopes.getStore();
 if(!scope)throw Error('Klubbkontekst mangler.');
 const options=args[2]||{};
 args[2]={...options,global:{...options.global,headers:{...options.global?.headers,'x-portal-club':scope.clubId}}};
 return scopeDatabase((baseClient as any)(...args),scope.clubId);
}
export function servePortal(handler:(req:Request)=>Promise<Response>|Response){
 return Deno.serve(async(req:Request)=>{
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type,x-portal-club','Access-Control-Allow-Methods':'POST,OPTIONS'};
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
   const header=req.headers.get('Authorization')||'';
   if(!header.startsWith('Bearer '))return new Response('Ikke innlogget',{status:401,headers:cors});
   const clubId=req.headers.get('x-portal-club')||OSLO;
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clubId))return new Response('Ugyldig klubb',{status:400,headers:cors});
   const admin=baseClient(Deno.env.get('SUPABASE_URL')!,secret()!,{auth:{persistSession:false}});
   const {data:{user},error}=await admin.auth.getUser(header.slice(7));
   if(error||!user)return new Response('Ugyldig innlogging',{status:401,headers:cors});
   const {data:actor,error:actorError}=await admin.from('app_users').select('person_id,app_role,active').eq('user_id',user.id).maybeSingle();
   const {data:club,error:clubError}=await admin.from('portal_clubs').select('id').eq('id',clubId).eq('active',true).maybeSingle();
   if(actorError||clubError||!actor?.active||!actor.person_id||!club)return new Response('Ingen tilgang',{status:403,headers:cors});
   if(actor.app_role!=='system_admin'){
    const {data:membership,error:membershipError}=await admin.from('portal_club_memberships').select('role').eq('person_id',actor.person_id).eq('club_id',clubId).eq('active',true).limit(1);
    if(membershipError||!membership?.length)return new Response('Ingen tilgang til klubben',{status:403,headers:cors});
   }
   return await scopes.run({clubId,personId:actor.person_id,userId:user.id},()=>handler(req));
  }catch(error){console.error('Portal scope failed',error instanceof Error?error.message:'unknown');return new Response('Tilgangskontrollen kunne ikke fullføres.',{status:500,headers:cors});}
 });
}

// The current accounting connection belongs exclusively to Oslo.
export function createOsloClient(...args:any[]){
 const options=args[2]||{};
 args[2]={...options,global:{...options.global,headers:{...options.global?.headers,'x-portal-club':OSLO}}};
 return scopeDatabase((baseClient as any)(...args),OSLO);
}
// Only trusted, already authenticated background jobs use this entry point.
export function createClubClient(clubId:string){
 return scopeDatabase(baseClient(Deno.env.get('SUPABASE_URL')!,secret()!,{global:{headers:{'x-portal-club':clubId}},auth:{persistSession:false}}),clubId);
}

// Validate linked entities BEFORE an external message is sent.
export async function validateMessageScope(client:any,eventId:string|null,recipients:any[]){
 if(eventId){const {data,error}=await client.from('events').select('id').eq('id',eventId).maybeSingle();if(error||!data)throw Error('Arrangementet er ikke tilgjengelig i valgt klubb.');}
 const ids=[...new Set(recipients.map(r=>r.personId).filter(Boolean))];
 if(ids.length){const {data,error}=await client.from('portal_service_contacts').select('id').in('id',ids);if(error||ids.some(id=>!data?.some((p:any)=>p.id===id)))throw Error('En mottaker tilhører ikke valgt klubb.');}
}
