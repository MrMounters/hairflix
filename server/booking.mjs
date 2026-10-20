import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {LOCATIONS,SERVICES,DEPOSIT_CENTS,TIME_ZONE,HOLD_SECONDS,CHECKOUT_SECONDS,serviceForLocation} from './catalog.mjs';
import {RedisStore,unitKeys} from './store.mjs';
const UNAVAILABLE='Online appointments are not available yet. Please call your shop to book.';
const hash=s=>createHash('sha256').update(s).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const jsonEnv=(value,fallback={})=>{try{return value?JSON.parse(value):fallback;}catch{return fallback;}};
const clean=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const phoenixDate=ms=>new Date(ms-7*3600000).toISOString().slice(0,10);
function validDate(date,now){if(!/^\d{4}-\d{2}-\d{2}$/.test(date??''))return false;const ms=Date.parse(date+'T12:00:00-07:00');return Number.isFinite(ms)&&phoenixDate(ms)===date&&date>=phoenixDate(now)&&ms<=now+61*86400000;}
function localMinute(ms){const d=new Date(ms-7*3600000);return d.getUTCHours()*60+d.getUTCMinutes();}
const safeBooking=b=>({id:b.id,status:b.status,location:b.location,service:b.service,start:b.start,end:b.end,timeZone:TIME_ZONE,depositCents:DEPOSIT_CENTS,priceCents:b.priceCents,balanceCents:b.priceCents===null?null:b.priceCents-DEPOSIT_CENTS,expiresAt:b.expiresAt,paidAt:b.paidAt??null});
const missingPaymentMessage='Online deposits are not available yet. Please call your shop to book.';
export function createBookingApp(env={},dependencies={}) {
 const clock=dependencies.clock??(()=>Date.now());
 const redisUrl=env.UPSTASH_REDIS_REST_URL??env.KV_REST_API_URL;
 const redisToken=env.UPSTASH_REDIS_REST_TOKEN??env.KV_REST_API_TOKEN;
 const store=dependencies.store??(redisUrl&&redisToken?new RedisStore(redisUrl,redisToken):null);
 const capacity=jsonEnv(env.BOOKING_CAPACITY_JSON);
 const overrides=jsonEnv(env.SERVICE_CATALOG_JSON);
 const active=new Set((env.BOOKING_ACTIVE_LOCATIONS??'').split(',').map(s=>s.trim()).filter(Boolean));
 const capacityFor=id=>Number.isInteger(capacity[id])&&capacity[id]>0&&capacity[id]<=30?capacity[id]:0;
 const calendarReady=id=>env.BOOKING_ENABLED==='true'&&!!store&&active.has(id)&&capacityFor(id)>0;
 const paymentReady=!!dependencies.payment || !!(env.STRIPE_API_KEY&&env.STRIPE_WEBHOOK_SECRET&&env.PUBLIC_ORIGIN);
 const menuReady=(id,serviceId)=>id==='university'||(Number.isInteger(overrides?.[id]?.[serviceId]?.durationMins)&&overrides[id][serviceId].durationMins>=5&&overrides[id][serviceId].durationMins<=240);
 const locationReady=id=>calendarReady(id)&&paymentReady&&SERVICES.some(s=>menuReady(id,s.id));
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
 const result=(status,data)=>({status,headers,body:JSON.stringify(data)});
 const error=(status,message,code)=>result(status,{error:message,message,code});
 async function checkout(b,token){
  if(dependencies.payment)return dependencies.payment(b,token);
  const {default:Stripe}=await import('stripe');
  const stripe=new Stripe(env.STRIPE_API_KEY,{apiVersion:'2026-08-26.dahlia',maxNetworkRetries:2});
  const origin=new URL(env.PUBLIC_ORIGIN).origin;
  const suffix=randomBytes(8).toString('hex').replace(/[0-9]/g,n=>String.fromCharCode(97+Number(n))).slice(0,8);
  const l=LOCATIONS.find(x=>x.id===b.location),s=serviceForLocation(b.service,b.location,overrides);
  const session=await stripe.checkout.sessions.create({
   mode:'payment',client_reference_id:b.id,customer_email:b.email,
   line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:DEPOSIT_CENTS,product_data:{name:'Hairflix booking deposit',description:`${s.name} · ${l.name}. Remaining service balance is paid at the shop.`}}}],
   success_url:`${origin}/book.html?booking=${encodeURIComponent(b.id)}&token=${encodeURIComponent(token)}`,
   cancel_url:`${origin}/book.html?cancelled=1&booking=${encodeURIComponent(b.id)}&token=${encodeURIComponent(token)}`,
   metadata:{booking_id:b.id},expires_at:Math.floor(clock()/1000)+CHECKOUT_SECONDS,
   integration_identifier:`hairflix-booking-${suffix}`
  },{idempotencyKey:`hairflix-deposit-${b.id}`});
  if(!session.url||!session.id)throw new Error('Checkout unavailable');
  return {id:session.id,url:session.url};
 }
 function isValidStart(location,service,start){
  const ms=Date.parse(start),date=Number.isFinite(ms)?phoenixDate(ms):'';
  if(!validDate(date,clock())||ms<clock()+3600000||ms%60000!==0)return false;
  const day=new Date(date+'T12:00:00-07:00').getUTCDay(),hours=location.hours[day];
  const minute=localMinute(ms);
  return minute>=hours[0]&&(minute-hours[0])%15===0&&minute+service.durationMins<=hours[1];
 }
 async function availability(query){
  const location=LOCATIONS.find(x=>x.id===query.location),service=serviceForLocation(query.service,query.location,overrides);
  if(!location||!service||!validDate(query.date,clock()))return error(400,'Choose a valid shop, treatment and date.','invalid_selection');
  if(!calendarReady(location.id)||!menuReady(location.id,service.id))return result(200,{date:query.date,timeZone:TIME_ZONE,slots:[],ready:false,message:UNAVAILABLE});
  const day=new Date(query.date+'T12:00:00-07:00').getUTCDay(),[open,close]=location.hours[day];
  const base=Date.parse(query.date+'T00:00:00-07:00');
  const candidates=[];const keys=new Set();
  for(let minute=open;minute+service.durationMins<=close;minute+=15){
   const start=base+minute*60000,end=start+service.durationMins*60000;
   if(start<clock()+3600000)continue;
   const seats=[];
   for(let seat=0;seat<capacityFor(location.id);seat++){const units=unitKeys(location.id,new Date(start).toISOString(),new Date(end).toISOString(),seat);seats.push(units);units.forEach(k=>keys.add(k));}
   candidates.push({start:new Date(start).toISOString(),end:new Date(end).toISOString(),seats});
  }
  const list=[...keys],occupied=await store.occupancy(list),map=new Map(list.map((k,i)=>[k,occupied[i]]));
  const slots=candidates.filter(c=>c.seats.some(units=>units.every(k=>!map.get(k)))).map(c=>({start:c.start,end:c.end,label:new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,hour:'numeric',minute:'2-digit'}).format(new Date(c.start))}));
  return result(200,{date:query.date,timeZone:TIME_ZONE,slots,ready:true,message:slots.length?'':'No times remain on this date. Please choose another day.'});
 }
 async function reserve(body,ip){
  const location=LOCATIONS.find(x=>x.id===body.location),service=serviceForLocation(body.service,body.location,overrides);
  if(!location||!service)return error(400,'Choose a shop and service.','invalid_selection');
  if(!locationReady(location.id)||!menuReady(location.id,service.id))return error(503,paymentReady?UNAVAILABLE:missingPaymentMessage,'booking_unavailable');
  if(!await store.rateLimit(hash(ip??'unknown').slice(0,24),8,900))return error(429,'Too many attempts. Please wait a few minutes before trying again.','rate_limited');
  const name=clean(body.name,100),email=clean(body.email,254).toLowerCase(),phone=clean(body.phone,30),start=clean(body.start,40);
  if(body.website)return error(400,'Please try again.','invalid_request');
  if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||phone.replace(/\D/g,'').length<10||phone.replace(/\D/g,'').length>15||body.privacyConsent!==true)return error(400,'Enter your name, email and phone, and agree to booking contact.','invalid_contact');
  if(!isValidStart(location,service,start))return error(400,'That time is not bookable. Please choose a current available time.','invalid_time');
  const token=randomBytes(32).toString('base64url'),now=clock();
  const b={id:randomUUID(),tokenHash:hash(token),status:'awaiting_deposit',location:location.id,service:service.id,name,email,phone,start:new Date(start).toISOString(),end:new Date(Date.parse(start)+service.durationMins*60000).toISOString(),priceCents:service.priceCents,depositCents:DEPOSIT_CENTS,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+HOLD_SECONDS*1000).toISOString(),privacyConsentAt:new Date(now).toISOString(),marketingConsent:body.marketingConsent===true,marketingConsentAt:body.marketingConsent===true?new Date(now).toISOString():null};
  let held=false;
  for(let seat=0;seat<capacityFor(location.id);seat++){b.seat=seat;if(await store.reserve(b,HOLD_SECONDS,now)){held=true;break;}}
  if(!held)return error(409,'That time was just taken. Please choose another time.','slot_taken');
  try{
   const session=await checkout(b,token);
   await store.patch(b.id,{checkoutSessionId:session.id});
   return result(201,{...safeBooking(b),token,checkoutUrl:session.url});
  }catch{
   await store.release(b,'checkout_failed');
   return error(503,'The deposit checkout could not open. Your time was released; please try again or call the shop.','checkout_unavailable');
  }
 }
 async function webhook(raw,signature){
  if(!store||!env.STRIPE_WEBHOOK_SECRET)return error(503,'Payments are not configured.','payment_unavailable');
  const fields=String(signature??'').split(',').map(s=>s.split('='));
  const timestamp=fields.find(x=>x[0]==='t')?.[1],signatures=fields.filter(x=>x[0]==='v1').map(x=>x[1]);
  if(!/^\d+$/.test(timestamp??'')||Math.abs(clock()/1000-Number(timestamp))>300)return error(400,'Invalid signature.','invalid_signature');
  const expected=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(timestamp+'.').update(raw).digest('hex');
  if(!signatures.some(s=>equal(s,expected)))return error(400,'Invalid signature.','invalid_signature');
  let event;try{event=JSON.parse(raw.toString());}catch{return error(400,'Invalid event.','invalid_event');}
  if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return result(200,{received:true});
  const session=event.data?.object;
  if(session?.payment_status!=='paid')return result(200,{received:true});
  const id=session.metadata?.booking_id;
  if(!id)return error(400,'Booking reference missing.','invalid_reference');
  const b=await store.get(id);
  if(!b)return error(400,'Booking reference not found.','invalid_reference');
  if(b.checkoutSessionId!==session.id||session.client_reference_id!==b.id||session.amount_total!==DEPOSIT_CENTS||session.currency!=='usd')return error(400,'Payment does not match booking.','payment_mismatch');
  if(Date.parse(b.start)<=clock()){await store.patch(b.id,{status:'payment_review',paidAt:new Date(clock()).toISOString(),paymentId:session.payment_intent??session.id});return result(200,{received:true,status:'payment_review'});}
  const status=await store.confirm(b,clock(),session.payment_intent??session.id);
  return result(200,{received:true,status});
 }
 return async function handle(req){
  const path=req.path.replace(/\/$/,'')||'/';const query=req.query??{};
  try{
   if(req.method==='GET'&&path==='/api/config'){
    const locations=LOCATIONS.map(l=>({...l,availabilityReady:calendarReady(l.id),bookingReady:locationReady(l.id),capacity:capacityFor(l.id)}));
    return result(200,{locations,services:SERVICES.map(s=>({...s,pricesByLocation:Object.fromEntries(LOCATIONS.map(l=>[l.id,serviceForLocation(s.id,l.id,overrides).priceCents])),bookableByLocation:Object.fromEntries(LOCATIONS.map(l=>[l.id,menuReady(l.id,s.id)]))})),depositCents:DEPOSIT_CENTS,currency:'usd',timeZone:TIME_ZONE,bookingReady:locations.some(l=>l.bookingReady),availabilityReady:locations.some(l=>l.availabilityReady),paymentReady,message:locations.some(l=>l.bookingReady)?'':UNAVAILABLE});
   }
   if(req.method==='GET'&&path==='/api/availability')return await availability(query);
   if(req.method==='POST'&&path==='/api/stripe/webhook')return await webhook(req.body??Buffer.alloc(0),req.headers?.['stripe-signature']);
   if(req.method==='POST'&&path==='/api/bookings'){
    const origin=req.headers?.origin,expected=env.PUBLIC_ORIGIN;
    if(expected&&origin&&new URL(origin).origin!==new URL(expected).origin)return error(403,'Request not allowed.','invalid_origin');
    let body;try{body=JSON.parse(req.body.toString());}catch{return error(400,'Please check your booking details.','invalid_json');}
    return await reserve(body,req.ip);
   }
   const match=path.match(/^\/api\/bookings\/([a-f0-9-]{36})$/);
   if(req.method==='GET'&&match){
    if(!store)return error(503,UNAVAILABLE,'booking_unavailable');
    const b=await store.get(match[1]);
    if(!b||!equal(b.tokenHash,hash(String(query.token??''))))return error(404,'Booking not found.','not_found');
    if(b.status==='awaiting_deposit'&&Date.parse(b.expiresAt)<clock())b.status='expired';
    return result(200,safeBooking(b));
   }
   if(req.method==='GET'&&path==='/api/admin/bookings'){
    const admin=env.BOOKING_ADMIN_TOKEN;
    if(!admin||admin.length<32||!equal(req.headers?.authorization??'',`Bearer ${admin}`))return error(401,'Sign in required.','unauthorized');
    if(!store)return error(503,'Booking storage is not connected.','booking_unavailable');
    if(!validDate(query.date,clock()-31*86400000))return error(400,'Choose a valid date.','invalid_date');
    return result(200,{bookings:await store.list(query.date)});
   }
   return error(404,'Not found.','not_found');
  }catch{return error(503,'The booking service is temporarily unavailable. Please try again or call your shop.','service_unavailable');}
 };
}
