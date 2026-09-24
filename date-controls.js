// Native select controls with a compatible backing value for existing forms.
(()=>{
 const dateValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
 function upgrade(input){
  if(input.dataset.selectReady)return;input.dataset.selectReady='true';
  const kind=input.dataset.nativeDate,initial=input.value,base=input.id||'date-'+crypto.randomUUID();input.id=base;
  const field=document.createElement('fieldset'),legend=document.createElement('legend');
  const label=document.querySelector(`label[for="${CSS.escape(base)}"]`);
  legend.textContent=label?.textContent||input.getAttribute('aria-label')||input.closest('fieldset')?.querySelector('legend')?.textContent||(kind==='date'?'Dato':'Klokkeslett');field.append(legend);
  const selects=[];const parts=kind==='date'?[['Day','Dag',1,31],['Month','Måned',1,12],['Year','År',1900,new Date().getFullYear()+20]]:[['Hour','Time',0,23],['Minute','Minutt',0,59]];
  for(const [suffix,title,first,last] of parts){const l=document.createElement('label'),s=document.createElement('select');s.id=base+suffix;l.htmlFor=s.id;l.textContent=title;s.append(new Option('Velg',''));for(let n=first;n<=last;n++)s.append(new Option(String(n).padStart(kind==='time'?2:1,'0'),String(n)));field.append(l,s);selects.push(s);}
  input.after(field);input.focus=()=>selects[0].focus();if(label)label.htmlFor=selects[0].id;
  const sync=()=>{const v=dateValue.get.call(input);let values=kind==='date'?v.split('-').reverse():v.split(':');selects.forEach((s,i)=>{const val=values[i]!==undefined&&values[i]!==''?String(Number(values[i])):'';if(val&&!Array.from(s.options).some(o=>o.value===val))s.add(new Option(val,val));s.value=val;s.required=input.required;s.disabled=input.disabled;s.setCustomValidity('');});};
  Object.defineProperty(input,'value',{get(){return dateValue.get.call(input)},set(v){dateValue.set.call(input,v);sync();}});
  const change=()=>{const values=selects.map(s=>s.value);let valid=true,value='';if(values.every(Boolean)){if(kind==='date'){const [d,m,y]=values.map(Number),dt=new Date(y,m-1,d);valid=dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d;value=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}else value=values.map(x=>x.padStart(2,'0')).join(':');}else valid=values.every(v=>!v)&&!input.required;if(value&&((input.min&&value<input.min)||(input.max&&value>input.max)))valid=false;selects[0].setCustomValidity(valid?'':'Velg en fullstendig og gyldig '+(kind==='date'?'dato.':'tid.'));dateValue.set.call(input,valid?value:'');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
  selects.forEach(s=>s.addEventListener('change',change));input.form?.addEventListener('reset',()=>queueMicrotask(()=>{input.value=initial;}));new MutationObserver(sync).observe(input,{attributes:true,attributeFilter:['required','disabled']});input.value=initial;
 }
 const scan=()=>document.querySelectorAll('input[data-native-date]:not([data-select-ready])').forEach(upgrade);
 const start=()=>{scan();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
