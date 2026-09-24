const {JSDOM}=require(process.env.JSDOM_MODULE||'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const r=path.join(__dirname,'..');
(async()=>{
const dom=new JSDOM('<form><label for="d">Dato</label><input id="d" type="hidden" data-native-date="date" required><label for="t">Tid</label><input id="t" type="hidden" data-native-date="time"></form><select id="eDay"></select><select id="eMonth"></select><select id="eYear"></select><select id="eHour"></select><select id="eMinute"></select>',{runScripts:'outside-only'});
const w=dom.window;w.CSS={escape:x=>x};w.eval(fs.readFileSync(path.join(r,'date-controls.js'),'utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await Promise.resolve();
const d=w.document.getElementById('d'),t=w.document.getElementById('t'),form=w.document.querySelector('form');
assert.equal(form.checkValidity(),false);d.value='2018-02-28';assert.equal(w.document.getElementById('dYear').value,'2018');assert(form.checkValidity());
const change=(id,value)=>{const s=w.document.getElementById(id);s.value=value;s.dispatchEvent(new w.Event('change',{bubbles:true}));};
change('dDay','31');await Promise.resolve();assert.equal(d.value,'');assert(!form.checkValidity());assert.equal(w.document.getElementById('dDay').value,'31');
change('dDay','28');assert.equal(d.value,'2018-02-28');assert(form.checkValidity());t.value='18:10';assert.equal(w.document.getElementById('tMinute').value,'10');change('tMinute','47');assert.equal(t.value,'18:47');
form.insertAdjacentHTML('beforeend','<label for="later">Senere dato</label><input type="hidden" id="later" data-native-date="date">');await new Promise(ok=>w.setTimeout(ok,0));assert(w.document.getElementById('laterDay'));
w.eval(fs.readFileSync(path.join(r,'events.js'),'utf8'));w.populateDateSelects('e');w.setDateSelects('e','2010-05-19');assert.equal(w.getDateFromSelects('e'),'2010-05-19');w.populateTimeSelects('e');w.setTimeSelects('e','18:10:00');assert.equal(w.getTimeFromSelects('e'),'18:10:00');
const html=fs.readFileSync(path.join(r,'guideview.html'),'utf8');w.document.body.insertAdjacentHTML('beforeend','<section id="routingPanel"><div id="routingMatrix"></div></section>');
w.eval('const esc=s=>s;'+html.slice(html.indexOf('function routeFor('),html.indexOf('async function fetchRouting'))+html.slice(html.indexOf('function renderRoutingPanel('),html.indexOf('routingMatrix.addEventListener')));
const data={people:[],participants:[{person_id:'a'},{person_id:'b'}],routes:[]};w.renderRoutingPanel(data);const cb=w.document.querySelector('#routingMatrix input');cb.focus();data.routes=[{source_person_id:'a',target_person_id:'b',audio_enabled:false,video_enabled:true}];w.renderRoutingPanel(data);assert.equal(w.document.activeElement,cb);assert.equal(cb.checked,false);data.participants.push({person_id:"c"});w.renderRoutingPanel(data);assert.equal(w.document.activeElement,cb);
console.log('PASS: real DOM native selectors preserve dates/minutes, reject invalid dates, upgrade dynamically, and routing refresh preserves focused checkbox.');await new Promise(ok=>w.setTimeout(ok,0));
})().catch(e=>{console.error(e);process.exitCode=1});
