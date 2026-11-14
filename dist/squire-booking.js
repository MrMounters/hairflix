// Uses the existing Hairflix Squire destination. Direct links remain usable without JS.
(()=>{
 const url='https://getsquire.com/booking/brands/hairflix-barbershop';
 if(typeof HTMLDialogElement==='undefined')return;
 const dialog=document.createElement('dialog');dialog.className='squire-dialog';dialog.setAttribute('aria-labelledby','squire-title');
 dialog.innerHTML=`<div class="squire-heading"><div><h2 id="squire-title">Book with Hairflix</h2><p>Appointments powered by Squire</p></div><button type="button" class="squire-close" aria-label="Close booking">✕</button></div><iframe title="Hairflix appointment booking on Squire" allow="payment" referrerpolicy="strict-origin-when-cross-origin"></iframe><div class="squire-fallback"><span>Prefer a separate window?</span><a href="${url}" target="_blank" rel="noopener">Open Squire booking ↗</a></div>`;
 document.body.append(dialog);const frame=dialog.querySelector('iframe');let opener=null;
 dialog.querySelector('.squire-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>{frame.removeAttribute('src');document.body.classList.remove('squire-open');opener?.focus({preventScroll:true});});
 document.addEventListener('click',e=>{const link=e.target.closest('a[data-squire-booking]');if(!link||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();opener=link;frame.src=url;document.body.classList.add('squire-open');dialog.showModal();});
})();
