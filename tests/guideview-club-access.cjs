const {stripTypeScriptTypes}=require('node:module');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
async function request(name,body,scope,error=false){
 let handler;const writes=[];
 const client={auth:{getUser:async()=>({data:{user:{id:'caller'}}})},rpc:async()=>({data:scope,error:error?{message:'Scope unavailable'}:null}),from(table){const q={};
 for(const m of ['select','eq','in','order','limit','ilike'])q[m]=()=>q;
 for(const m of ['insert','update','delete','upsert'])q[m]=v=>{writes.push({table,m,v});return q};
 const result=()=>({data:table==='app_users'?{person_id:'caller',app_role:'admin',active:true}:table==='guideview_sessions'?{id:'session',club_id:'other-club',created_by:'other',state:'planned'}:null,error:null});
 q.single=q.maybeSingle=async()=>result();q.then=(ok,bad)=>Promise.resolve(result()).then(ok,bad);return q}};
 const source=fs.readFileSync(path.join(__dirname,'../supabase/functions',name,'index.ts'),'utf8').replace(/^import .*\n/gm,'');
 const ctx=vm.createContext({console:{log(){},warn(){},error(){}},Response,crypto,Date,Deno:{env:{get:()=>undefined},serve:f=>handler=f},createClient:()=>client});
 vm.runInContext(stripTypeScriptTypes(source),ctx);
 const r=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify(body)}));
 return {status:r.status,body:await r.json(),writes};
}
(async()=>{
 const cases=[['guideview-session-actions',{action:'start',sessionId:'session'}],['guideview-session-actions',{action:'delete',sessionId:'session'}],['guideview-invitations',{action:'invite',sessionId:'session',personId:'target'}],['guideview-assignment-actions',{action:'assign',dogId:'dog',personId:'target',assignmentRole:'skoletrener'}],['guideview-assignment-actions',{action:'deactivate',assignmentId:'assignment'}],['guideview-routing-actions',{action:'set',sessionId:'session',sourcePersonId:'a',targetPersonId:'b'}]];
 for(const [name,body] of cases){const denied=await request(name,body,false);assert.equal(denied.status,403,name);assert.equal(denied.writes.length,0,name);const failed=await request(name,body,true,true);assert.equal(failed.status,500,name);assert.equal(failed.writes.length,0,name);}
 const own=await request('guideview-session-actions',{action:'start',sessionId:'session'},true);assert.equal(own.status,200);assert.equal(own.writes.length,1);
 console.log('PASS: actual GuideView handlers deny cross-club admin mutations and fail closed on scope lookup error; authorized start succeeds.');
})().catch(e=>{console.error(e);process.exitCode=1});
