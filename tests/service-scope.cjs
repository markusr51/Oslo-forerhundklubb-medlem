// Exercise the actual service adapter with synthetic clients, without network calls.
const {stripTypeScriptTypes}=require('node:module');
const {AsyncLocalStorage}=require('node:async_hooks');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const calls=[];let handler;
function client(url,key,options){
 return {auth:{getUser:async token=>({data:{user:token==='bad'?null:{id:token}},error:null})},from(table){
 const call={table,options,filters:[],operation:null};calls.push(call);
 const query={select(...args){call.operation='select';return this},update(input){call.operation='update';call.input=input;return this},delete(){call.operation='delete';return this},insert(input){call.operation='insert';call.input=input;return this},upsert(input){call.operation='upsert';call.input=input;return this},eq(...args){call.filters.push(args);return this},limit(){return this},maybeSingle(){return this},then(resolve,reject){
 const user=call.filters.find(f=>f[0]==='user_id')?.[1];
 let data=table==='app_users'?{person_id:user,user_id:user,app_role:'readonly',active:user!=='disabled'}:table==='portal_clubs'?{id:call.filters.find(f=>f[0]==='id')?.[1]}:table==='portal_club_memberships'?(call.filters.some(f=>f[1]==='outsider')?[]:[{role:'member'}]):[];
 return Promise.resolve({data,error:null}).then(resolve,reject);
 }};return query;}};
}
let source=fs.readFileSync(path.join(__dirname,'../supabase/functions/_shared/portal-scope.ts'),'utf8');
source=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'').replace(/^export /gm,''));
const context=vm.createContext({baseClient:client,AsyncLocalStorage,Request,Response,console,Deno:{env:{get:()=>''},serve:h=>{handler=h}}});
vm.runInContext(source+'\nglobalThis.api={scopeDatabase,createClient,servePortal};',context);
const {scopeDatabase,createClient,servePortal}=context.api;
(async()=>{
const scoped=scopeDatabase(client(),b);
for(const operation of ['select','update','delete']){const query=scoped.from('events')[operation]({title:'demo'});await query;assert.deepEqual(calls.at(-1).filters,[['club_id',b]]);}
await scoped.from('persons').select('*');assert.equal(calls.at(-1).table,'portal_scoped_members');assert.deepEqual(calls.at(-1).filters,[['club_id',b]]);
await scoped.from('helper_entries').insert([{person_id:'sample'}]);assert.equal(calls.at(-1).input[0].club_id,b);
assert.throws(()=>scoped.from('events').insert({club_id:a}));
await scoped.from('app_users').update({active:false}).eq('user_id','sample');assert.equal(calls.at(-1).table,'app_users');assert.deepEqual(calls.at(-1).filters,[['user_id','sample']]);
assert.throws(()=>createClient());
servePortal(async req=>{await new Promise(r=>setTimeout(r,req.headers.get('x-portal-club')===a?15:1));await createClient().from('events').select('*');return new Response('ok');});
const request=(token,club=b)=>new Request('https://example.invalid',{headers:{Authorization:'Bearer '+token,'x-portal-club':club}});
assert.equal((await handler(request('bad'))).status,401);
assert.equal((await handler(request('disabled'))).status,403);
assert.equal((await handler(request('outsider'))).status,403);
assert.equal((await handler(request('member','invalid'))).status,400);
const start=calls.length;assert.deepEqual((await Promise.all([handler(request('member',a)),handler(request('member',b))])).map(r=>r.status),[200,200]);
const queries=calls.slice(start).filter(c=>c.table==='events');assert.equal(queries.length,2);
for(const q of queries)assert.equal(q.filters[0][1],q.options.global.headers['x-portal-club']);
assert.deepEqual(new Set(queries.map(q=>q.filters[0][1])),new Set([a,b]));
console.log('PASS: real service adapter scopes reads, writes and inserts; rejects forged club IDs and unauthorized actors; concurrent requests keep separate club contexts.');
})().catch(e=>{console.error(e);process.exit(1)});
