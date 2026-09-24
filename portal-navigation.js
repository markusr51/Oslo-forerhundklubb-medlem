// Additive navigation, enabled only when the backend rollout is complete.
(async()=>{
 if(window.PORTAL_MULTICLUB_ENABLED!==true)return;
 const {data:{session}}=await sb.auth.getSession();if(!session)return;
 const me=await getCurrentAppUser();
 function append(){const nav=document.getElementById('portalNav')||document.querySelector('nav');if(!nav)return;
 for(const [href,label]of [['clubs.html','Klubber og oppdrag'],['my-dog.html','Min hund'],...(me?.app_role==='system_admin'?[['portal-support.html','Support og tilganger']]:[])]){
 if(nav.querySelector(`a[href="${href}"]`))continue;const a=document.createElement('a');a.href=href;a.textContent=label;nav.append(a);}}
 append();new MutationObserver(append).observe(document.body,{childList:true,subtree:true});
})().catch(console.error);
