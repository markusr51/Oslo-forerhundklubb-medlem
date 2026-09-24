// Run with Node 24+: node tests/forms-deadline.cjs
const {stripTypeScriptTypes}=require('node:module');
const vm=require('node:vm');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/forms-actions/index.ts'),'utf8').replace(/^import .*\n/,'');
const js=stripTypeScriptTypes(source);
const now=Date.parse('2026-09-24T12:00:00Z');
async function request(action,closesAt,extra={},role='admin'){
 let handler;const writes=[];
 const form={id:'form1',status:'published',response_mode:'identified',closes_at:closesAt};
 const db={from(table){let insert=false;const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},insert(value){insert=true;writes.push({table,value});return q},single(){return Promise.resolve(result())},maybeSingle(){return Promise.resolve(result())},then(ok,bad){return Promise.resolve(result()).then(ok,bad)}};
 function result(){if(table==='app_users')return {data:{active:true,person_id:'person1',app_role:role}};
 if(table==='forms')return {data:action==='my_forms'?[form]:form};
 if(table==='form_recipients')return {data:action==='my_forms'?[{form_id:'form1'}]:{id:'recipient'}};
 if(table==='form_responses')return {data:insert?{id:'response1'}:action==='my_forms'?[]:null};
 return {data:[]};}return q}};
 class Clock extends Date {static now(){return now}}
 const ctx=vm.createContext({console,Response,Date:Clock,Deno:{env:{get:()=>''},serve:fn=>handler=fn},createClient:()=>({...db,auth:{getUser:async()=>({data:{user:{id:'user1'}}})}})});
 vm.runInContext(js,ctx);
 const response=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({action,formId:'form1',title:'Test',answers:{},...extra})}));
 return {status:response.status,body:await response.json(),writes};
}
(async()=>{
 for(const action of ['get_public','submit']){
  for(const deadline of ['2026-09-24T11:59:59Z','2026-09-24T12:00:00Z','2026-09-24T14:00:00+02:00','invalid']){
   const r=await request(action,deadline);assert.equal(r.status,403);assert.equal(r.body.error,'Svarfristen er utløpt.');assert.equal(r.writes.length,0);
  }
  for(const deadline of [null,'2026-09-24T12:00:01Z'])assert.equal((await request(action,deadline)).status,200);
 }
 assert.equal((await request('my_forms','2026-09-24T12:00:00Z')).body.forms.length,0);
 assert.equal((await request('my_forms',null)).body.forms.length,1);
 assert.equal((await request('admin_list','2026-09-24T12:00:00Z')).status,200);
 assert.equal((await request('create',null,{closesAt:'invalid'})).status,400);
 assert.equal((await request('create',null,{closesAt:'2026-09-25T21:59:59Z'})).status,200);
 assert.equal((await request('create',null,{},'member')).status,403);
 console.log('PASS: handler tests cover expired/exact/future/no/invalid deadline, timezone offsets, zero writes on rejection, listing, creation validation and admin authorization.');
})().catch(e=>{console.error(e);process.exitCode=1});
