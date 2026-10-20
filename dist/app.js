import {locations,icon,google} from './data.js';
document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon)});
document.querySelectorAll('[data-google]').forEach(el=>{el.innerHTML=google});
document.querySelector('#year').textContent=String(new Date().getFullYear());
const tabs=document.querySelector('.shop-tabs');
const shopButtons=[...document.querySelectorAll('[data-shop]')];
const shopPanels=[...document.querySelectorAll('[data-shop-panel]')];
const setShop=id=>{
 const shop=locations.find(l=>l.id===id);if(!shop)return;
 shopButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.shop===id)));
 shopPanels.forEach(panel=>{panel.hidden=panel.dataset.shopPanel!==id;panel.classList.toggle('is-active',!panel.hidden)});
 const call=document.querySelector('.dock-call');call.href=`tel:${shop.tel}`;call.setAttribute('aria-label',`Call Hairflix ${shop.label}`);
 document.querySelector('.dock-book').href=`book.html?location=${id}`;
};
if(tabs){tabs.hidden=false;setShop('university');shopButtons.forEach(b=>b.addEventListener('click',()=>setShop(b.dataset.shop)))}
const motion=matchMedia('(prefers-reduced-motion: reduce)');
if(!motion.matches&&'IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{entries.filter(e=>e.isIntersecting).forEach((entry,i)=>{entry.target.animate([{opacity:.8,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:550,delay:Math.min(i,3)*65,easing:'cubic-bezier(.16,1,.3,1)'});observer.unobserve(entry.target)})},{threshold:.1});document.querySelectorAll('[data-reveal]').forEach(el=>observer.observe(el))}
// Keep the fixed booking controls clear of existing actions and focused content.
const dock=document.querySelector('.book-dock');
if(dock){let scheduled=false;const update=()=>{scheduled=false;if(dock.contains(document.activeElement))return;dock.hidden=false;const d=dock.getBoundingClientRect();const targets=[...document.querySelectorAll('h1,h2,.button,.shop-tabs button,.shop-call,.shop-proof')].filter(el=>!el.closest('[hidden]'));dock.hidden=targets.some(el=>{const r=el.getBoundingClientRect();return r.width&&r.top<d.bottom+8&&r.bottom>d.top-8&&r.left<d.right&&r.right>d.left})};const queue=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(update)}};addEventListener('scroll',queue,{passive:true});addEventListener('resize',queue);document.fonts.ready.then(queue);document.addEventListener('click',queue);document.addEventListener('focusin',event=>{if(dock.contains(event.target)||dock.hidden)return;const r=event.target.getBoundingClientRect(),d=dock.getBoundingClientRect();if(r.top<d.bottom&&r.bottom>d.top)event.target.scrollIntoView({block:'center',behavior:'instant'})});queue()}
