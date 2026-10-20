import {locations,services as menu,icon,google} from './data.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));
const query=new URLSearchParams(location.search);
const state={step:0,location:locations.some(l=>l.id===query.get('location'))?query.get('location'):'university',service:query.get('service')||'',start:'',config:null,slots:[],loading:false};
let slotRequest=0;
const dateInput=$('#appointment-date');
const today=()=>{const values=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Phoenix',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return `${values.year}-${values.month}-${values.day}`};
const addDays=(day,n)=>{const d=new Date(day+'T12:00:00-07:00');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
dateInput.min=today();dateInput.max=addDays(today(),30);dateInput.value=addDays(today(),1);
const dateLabel=day=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Phoenix',weekday:'short',month:'short',day:'numeric'}).format(new Date(day+'T12:00:00-07:00'));
const selectedShop=()=>locations.find(l=>l.id===state.location);
function catalog(){const list=Array.isArray(state.config?.services)?state.config.services:menu.map(s=>({...s,priceCents:s.price*100,durationMinutes:parseInt(s.time,10)}));return list.filter(s=>!s.locationIds||s.locationIds.includes(state.location))}
const selectedService=()=>catalog().find(s=>s.id===state.service);
function renderShops(){
 $('#booking-locations').innerHTML=locations.map(l=>`<label class="booking-choice"><input type="radio" name="location" value="${l.id}" ${l.id===state.location?'checked':''}><span><strong>${esc(l.label)} · ${l.city}</strong><small>${esc(l.address)}</small><span class="choice-rating">${google}${l.rating} · ${l.reviews.toLocaleString('en-US')} Google reviews</span></span></label>`).join('');
 document.querySelectorAll('[name=location]').forEach(e=>e.addEventListener('change',()=>{state.location=e.value;state.start='';renderServices()}));
}
function renderServices(){
 const list=catalog();if(!list.some(s=>s.id===state.service))state.service='';
 $('#service-prompt').textContent=`At Hairflix ${selectedShop().label}. Choose your service.`;
 $('#booking-services').innerHTML=list.map(s=>{const price=state.location==='university'&&Number.isFinite(s.priceCents)?`$${(s.priceCents/100).toFixed(0)}`:'Price confirmed by shop';const minutes=s.durationMinutes||s.durationMins||s.duration||parseInt(s.time,10);return `<label class="booking-choice"><input type="radio" name="service" value="${esc(s.id)}" ${s.id===state.service?'checked':''}><span><strong>${esc(s.name)}</strong><small>${esc(price)}${Number.isFinite(minutes)?` · ${minutes} min`:''}</small></span></label>`}).join('');
 document.querySelectorAll('[name=service]').forEach(e=>e.addEventListener('change',()=>{state.service=e.value;state.start=''}));
}
function renderDates(){
 $('#date-shortcuts').innerHTML=Array.from({length:4},(_,i)=>{const day=addDays(today(),i);const d=new Date(day+'T12:00:00-07:00');return `<button type="button" data-date="${day}" aria-pressed="${dateInput.value===day}"><span>${i===0?'Today':new Intl.DateTimeFormat('en-US',{timeZone:'America/Phoenix',weekday:'short'}).format(d)}</span><strong>${d.getUTCDate()}</strong></button>`}).join('');
 document.querySelectorAll('[data-date]').forEach(e=>e.addEventListener('click',()=>{dateInput.value=e.dataset.date;renderDates();loadSlots()}));
}
function message(text,target='#booking-error'){const el=$(target);el.textContent=text;el.hidden=!text}
function directBooking(){const shop=selectedShop();$('#direct-booking').hidden=false;const call=$('#direct-call');call.href=`tel:${shop.tel}`;call.textContent=`Call ${shop.phone}`;$('#direct-squire').hidden=shop.id==='apache'}
async function loadSlots(){
 const request=++slotRequest;state.start='';state.slots=[];$('#time-slots').replaceChildren();$('#direct-booking').hidden=true;$('#booking-next').disabled=true;
 if(!dateInput.value||dateInput.value<dateInput.min||dateInput.value>dateInput.max){message('Choose a date within the next 30 days.','#availability-state');return}
 message('Finding times for your cut…','#availability-state');
 try{
  const params=new URLSearchParams({location:state.location,service:state.service,date:dateInput.value});const response=await fetch(`/api/availability?${params}`);const data=await response.json();if(request!==slotRequest)return;
  if(!response.ok||data.ready===false){message('Book directly with the shop while the new calendar opens.','#availability-state');directBooking();return}
  state.slots=Array.isArray(data.slots)?data.slots:[];
  message(state.slots.length?'Choose a time that works for you.':'No times available on this date. Try another day.','#availability-state');
  for(const slot of state.slots){const b=document.createElement('button');b.type='button';b.className='time-slot';b.textContent=slot.label;b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>{state.start=slot.start;document.querySelectorAll('.time-slot').forEach(e=>e.setAttribute('aria-pressed',String(e===b)));$('#booking-next').disabled=false});$('#time-slots').append(b)}
 }catch{if(request!==slotRequest)return;message('Online times are unavailable right now. Book directly with the shop below.','#availability-state');directBooking()}
}
function renderSummary(){
 const box=$('#booking-summary');box.replaceChildren();
 const service=selectedService();const slot=state.slots.find(s=>s.start===state.start);
 for(const [label,value] of [['Shop',`${selectedShop().label} · ${selectedShop().city}`],['Service',service?.name||''],['When',`${dateLabel(dateInput.value)} · ${slot?.label||''}`],['Deposit','$5.00']]){const row=document.createElement('div'),key=document.createElement('span'),val=document.createElement('strong');key.textContent=label;val.textContent=value;row.append(key,val);box.append(row)}
}
function showStep(n){
 state.step=n;message('');document.querySelectorAll('.booking-step').forEach((e,i)=>e.hidden=i!==n);$('#booking-back').hidden=n===0;$('#step-counter').textContent=`${n+1} of 4`;$('#step-caption').textContent=['Choose your shop','Find your service','Choose your time','Your details'][n];$('.booking-progress').setAttribute('aria-valuenow',String((n+1)*25));$('.booking-progress>span').style.width=`${(n+1)*25}%`;$('#booking-next').innerHTML=n===3?`Continue to $5 checkout ${icon('arrow')}`:`Continue ${icon('arrow')}`;$('#booking-next').disabled=false;
 if(n===2){renderDates();loadSlots()}if(n===3)renderSummary();
 const legend=$(`.booking-step[data-step="${n}"] legend`);legend.tabIndex=-1;legend.focus({preventScroll:true});$('#booking').scrollIntoView({block:'start',behavior:'instant'});
}
$('#booking-back').addEventListener('click',()=>showStep(Math.max(0,state.step-1)));
dateInput.addEventListener('change',()=>{renderDates();loadSlots()});
$('#booking-form').addEventListener('submit',async event=>{
 event.preventDefault();message('');
 if(state.step===0){showStep(1);return}
 if(state.step===1){if(!state.service){message('Choose a service to continue.');$('[name=service]')?.focus();return}showStep(2);return}
 if(state.step===2){if(!state.start){message('Choose an available time to continue.');return}showStep(3);return}
 const name=$('#booking-name'),email=$('#booking-email'),phone=$('#booking-phone'),consent=$('#booking-privacy');
 if(name.value.trim().length<2){message('Enter your first and last name.');name.focus();return}
 if(!email.validity.valid||!email.value.trim()){message('Enter a valid email address.');email.focus();return}
 const digits=phone.value.replace(/\D/g,'');if(digits.length<7||digits.length>15){message('Enter a valid phone number.');phone.focus();return}
 if(!consent.checked){message('Confirm the booking details and terms to continue.');consent.focus();return}
 $('#booking-next').disabled=true;$('#booking-next').textContent='Preparing your booking…';
 try{
  const response=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:state.location,service:state.service,start:state.start,name:name.value.trim(),email:email.value.trim(),phone:phone.value.trim(),privacyConsent:true,marketingConsent:$('#booking-marketing').checked})});const data=await response.json();
  if(!response.ok)throw new Error(response.status===409?'That time was just taken. Go back and choose another.':'We couldn’t start your booking. Nothing has been charged. Please try again or call the shop.');
  const checkout=new URL(data.checkoutUrl);if(checkout.protocol!=='https:'||checkout.hostname!=='checkout.stripe.com')throw new Error('Checkout is unavailable. Please call the shop. Nothing has been charged.');
  location.assign(checkout.href);
 }catch(error){message(error.message||'Unable to book right now. Please call the shop.');$('#booking-next').disabled=false;$('#booking-next').innerHTML=`Continue to $5 checkout ${icon('arrow')}`}
});
async function loadConfig(){try{const response=await fetch('/api/config');if(response.ok)state.config=await response.json()}catch{/* Public shop/menu information still works; no simulated availability. */}renderServices()}
async function showReturn(){
 const id=query.get('booking')||query.get('booking_id'),token=query.get('token');if(!id||!token)return;
 $('#booking-form').hidden=true;const result=$('#booking-result');result.hidden=false;result.textContent='Checking your appointment…';
 try{const response=await fetch(`/api/bookings/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`);const data=await response.json();if(!response.ok)throw new Error();result.replaceChildren();const h=document.createElement('h2'),p=document.createElement('p');h.textContent=data.status==='confirmed'?'You’re in. Looking sharp.':'Your booking is being checked.';p.textContent=data.status==='confirmed'?'Your deposit is confirmed and your appointment is saved.':'Your payment has not been confirmed yet. Please wait a moment before checking again or contact the shop.';result.append(h,p);if(data.status==='confirmed'){const detail=document.createElement('p');detail.textContent=`Booking reference: ${id}`;result.append(detail)}const a=document.createElement('a');a.href='/#locations';a.textContent='Contact your shop';result.append(a)}catch{result.textContent='We couldn’t check this booking. Contact your shop before making another payment.'}
}
renderShops();renderServices();loadConfig();showReturn();
