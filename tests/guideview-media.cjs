const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/_shared/guideview-media.ts'),'utf8').replace(/^import .*\n/gm,'').replaceAll('export ','');
const calls=[];let acks=[],live=[{identity:'a',sid:'sid-a',tracks:[{sid:'audio-a',type:0},{sid:'video-a',type:1}]}];
class Client{async listParticipants(){return live}async updateParticipant(...x){calls.push(['permission',...x])}async updateSubscriptions(...x){calls.push(['subscription',...x])}async removeParticipant(...x){calls.push(['remove',...x])}async deleteRoom(...x){calls.push(['delete',...x])}}
const ctx=vm.createContext({RoomServiceClient:Client,Deno:{env:{get:()=> 'wss://example.test'}}});vm.runInContext(stripTypeScriptTypes(source),ctx);
const parts=[{person_id:'a'},{person_id:'b'}],session={id:'s',livekit_room:'room'},routes=[{source_person_id:'a',target_person_id:'b',audio_enabled:false,video_enabled:true,updated_at:'now'}];
const admin={from(table){return {select(){return {eq:async()=>({data:table==='portal_gv_media_ack'?acks:parts})}}}}};
(async()=>{
live.push({identity:'b',sid:'sid-b',tracks:[]});await ctx.syncMedia(admin,session,parts,routes);assert(calls.filter(c=>c[0]==='permission').every(c=>c[3].permission.canSubscribe===false));
acks=[{person_id:'a',participant_sid:'sid-a',route_version:vm.runInContext('routeVersion',ctx)(routes,'a')}];calls.length=0;await ctx.syncMedia(admin,session,parts,routes);assert(calls.filter(c=>c[0]==='permission').every(c=>c[3].permission.canSubscribe===true));assert(calls.some(c=>c[0]==='subscription'&&c[2]==='b'&&c[3].includes('audio-a')&&!c[3].includes('video-a')&&c[4]===false));
acks[0].participant_sid='previous-connection';calls.length=0;await ctx.syncMedia(admin,session,parts,routes);assert(calls.filter(c=>c[0]==='permission').every(c=>c[3].permission.canSubscribe===false));
live.push({identity:'outsider',tracks:[]});calls.length=0;await ctx.syncMedia(admin,session,parts,routes);assert(calls.some(c=>c[0]==='remove'&&c[2]==='outsider'));
calls.length=0;await ctx.closeMediaRoom(admin,session);assert.equal(calls.filter(c=>c[0]==='remove').length,2);assert.equal(calls.at(-1)[0],'delete');
console.log('PASS: media service denies subscriptions until current publisher ACL, denies stale reconnect acknowledgements, revokes blocked audio, removes outsiders, and closes the room server-side.');
})().catch(e=>{console.error(e);process.exitCode=1});
