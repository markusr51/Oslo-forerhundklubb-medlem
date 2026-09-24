// Shared by the new pages. Existing app.js and GuideView are unchanged.
window.PortalTools = (() => {
 const element = id => document.getElementById(id);
 const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const status = text => {element('pageStatus').textContent = text;};
 async function result(query) {const {data,error}=await query;if(error)throw Error(error.message);return data;}
 function action(node,event,fn) {node.addEventListener(event,async e=>{if(event==='submit')e.preventDefault();const b=event==='submit'?node.querySelector('button[type="submit"]'):node;if(b.disabled)return;b.disabled=true;const contextControls=['dogChoice','clubChoice'].map(element).filter(n=>n&&n!==b);const oldDisabled=contextControls.map(n=>n.disabled);contextControls.forEach(n=>n.disabled=true);status('Arbeider …');try{await fn(e);status('Ferdig.');}catch(err){status(err.message||String(err));}finally{b.disabled=false;contextControls.forEach((n,i)=>n.disabled=oldDisabled[i]);}});}
 async function start(current){const s=await requireSession();if(!s)return null;const me=await getCurrentAppUser();await renderPortalNavigation({current,me});return me;}
 function options(node,rows,label='name'){node.innerHTML='<option value="">Velg</option>'+rows.map(r=>`<option value="${escape(r.id)}">${escape(r[label])}</option>`).join('');}
 return {element,escape,status,result,action,start,options};
})();
