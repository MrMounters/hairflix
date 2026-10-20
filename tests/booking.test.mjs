import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createBookingApp} from '../server/booking.mjs';
import {SqliteStore} from '../server/sqlite-store.mjs';
const START='2026-10-21T16:00:00.000Z'; // 9am Phoenix
const form=(extra={})=>({location:'university',service:'regular-haircut',start:START,name:'Booking Test',email:'booking@example.test',phone:'6025550123',privacyConsent:true,marketingConsent:false,...extra});
function setup(){
 let now=Date.parse('2026-10-20T18:00:00Z');
 const store=new SqliteStore(':memory:',()=>now);
 const env={BOOKING_ENABLED:'true',BOOKING_ACTIVE_LOCATIONS:'university,apache',BOOKING_CAPACITY_JSON:'{"university":1,"apache":1}',STRIPE_WEBHOOK_SECRET:'test_webhook_signing_secret',PUBLIC_ORIGIN:'https://hairflix.example'};
 const payment=async b=>({id:'cs_'+b.id,url:'https://checkout.stripe.com/c/pay/test-only'});
 const app=createBookingApp(env,{store,clock:()=>now,payment});
 const request=async(method,path,body,query={},headers={})=>{const r=await app({method,path,query,headers,body:Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body??{})),ip:'127.0.0.1'});return {status:r.status,data:JSON.parse(r.body)};};
 const event=(booking,extra={})=>({type:'checkout.session.completed',data:{object:{id:'cs_'+booking.id,client_reference_id:booking.id,metadata:{booking_id:booking.id},payment_status:'paid',currency:'usd',amount_total:500,payment_intent:'pi_test_only',...extra}}});
 const webhook=async e=>{const raw=Buffer.from(JSON.stringify(e)),t=Math.floor(now/1000);const sig=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(t+'.').update(raw).digest('hex');return request('POST','/api/stripe/webhook',raw,{}, {'stripe-signature':`t=${t},v1=${sig}`});};
 return {app,store,request,event,webhook,setNow:v=>{now=v;},getNow:()=>now};
}
test('unconfigured production does not fabricate availability or accept customer bookings',async()=>{
 const app=createBookingApp({});
 const config=JSON.parse((await app({method:'GET',path:'/api/config'})).body);
 assert.equal(config.bookingReady,false);assert.equal(config.paymentReady,false);assert.equal(config.depositCents,500);
 const list=JSON.parse((await app({method:'GET',path:'/api/availability',query:{location:'university',service:'regular-haircut',date:'2026-10-21'}})).body);
 // Date may no longer be current if this test is run later; either validation or no slots is safe.
 assert.equal((list.slots??[]).length,0);
 const result=await app({method:'POST',path:'/api/bookings',body:Buffer.from(JSON.stringify(form()))});assert.equal(result.status,503);
});
test('University prices stay shop-specific and other menus need verified durations',async()=>{
 const t=setup();const {data}=await t.request('GET','/api/config');
 const haircut=data.services.find(s=>s.id==='regular-haircut');assert.equal(haircut.pricesByLocation.university,3300);assert.equal(haircut.pricesByLocation.apache,null);assert.equal(haircut.bookableByLocation.apache,false);
 const r=await t.request('GET','/api/availability',null,{location:'apache',service:'regular-haircut',date:'2026-10-21'});assert.equal(r.data.ready,false);assert.deepEqual(r.data.slots,[]);t.store.close();
});
test('one concurrent hold wins and overlapping services are excluded',async()=>{
 const t=setup();const pair=await Promise.all([t.request('POST','/api/bookings',form()),t.request('POST','/api/bookings',form())]);
 assert.deepEqual(pair.map(r=>r.status).sort(),[201,409]);
 const r=await t.request('POST','/api/bookings',form({service:'skin-fade',start:'2026-10-21T16:15:00.000Z'}));assert.equal(r.status,409);
 const adjacent=await t.request('POST','/api/bookings',form({start:'2026-10-21T16:30:00.000Z'}));assert.equal(adjacent.status,201);
 const slots=await t.request('GET','/api/availability',null,{location:'university',service:'regular-haircut',date:'2026-10-21'});assert.equal(slots.data.slots.some(s=>s.start===START),false);t.store.close();
});
test('held bookings expire, become bookable again, and preserve marketing choice separately',async()=>{
 const t=setup();const held=await t.request('POST','/api/bookings',form());const record=await t.store.get(held.data.id);assert.equal(record.marketingConsent,false);assert.equal(record.marketingConsentAt,null);assert.ok(record.privacyConsentAt);
 t.setNow(t.getNow()+36*60000);
 const status=await t.request('GET','/api/bookings/'+held.data.id,null,{token:held.data.token});assert.equal(status.data.status,'expired');
 const next=await t.request('POST','/api/bookings',form({marketingConsent:true}));assert.equal(next.status,201);assert.ok((await t.store.get(next.data.id)).marketingConsentAt);t.store.close();
});
test('private booking lookup requires its token and never exposes contact details',async()=>{
 const t=setup();const r=await t.request('POST','/api/bookings',form());
 assert.equal((await t.request('GET','/api/bookings/'+r.data.id,null,{token:'wrong'})).status,404);
 const view=await t.request('GET','/api/bookings/'+r.data.id,null,{token:r.data.token});assert.equal(view.status,200);for(const k of ['email','phone','name','tokenHash','marketingConsent'])assert.equal(k in view.data,false);t.store.close();
});
test('forged or mismatched payments cannot confirm a booking, paid webhook is idempotent',async()=>{
 const t=setup();const r=await t.request('POST','/api/bookings',form());
 const forged=await t.request('POST','/api/stripe/webhook',Buffer.from(JSON.stringify(t.event(r.data))),{}, {'stripe-signature':'t=1,v1=forged'});assert.equal(forged.status,400);
 const wrong=await t.webhook(t.event(r.data,{amount_total:100}));assert.equal(wrong.status,400);assert.equal((await t.store.get(r.data.id)).status,'awaiting_deposit');
 await t.webhook(t.event(r.data,{payment_status:'unpaid'}));assert.equal((await t.store.get(r.data.id)).status,'awaiting_deposit');
 const paid=await t.webhook(t.event(r.data));assert.equal(paid.status,200);assert.equal(paid.data.status,'confirmed');
 const again=await t.webhook(t.event(r.data));assert.equal(again.data.status,'confirmed');assert.ok((await t.store.get(r.data.id)).paidAt);t.store.close();
});
test('a late paid event does not steal a slot from a newer reservation',async()=>{
 const t=setup();const first=await t.request('POST','/api/bookings',form());t.setNow(t.getNow()+36*60000);
 const second=await t.request('POST','/api/bookings',form());assert.equal(second.status,201);
 const late=await t.webhook(t.event(first.data));assert.equal(late.data.status,'payment_review');assert.equal((await t.store.get(second.data.id)).status,'awaiting_deposit');t.store.close();
});
test('checkout failure releases the hold; no payment success is invented',async()=>{
 const t=setup();const app=createBookingApp({BOOKING_ENABLED:'true',BOOKING_ACTIVE_LOCATIONS:'university',BOOKING_CAPACITY_JSON:'{"university":1}'},{store:t.store,clock:t.getNow,payment:async()=>{throw new Error('Provider unavailable');}});
 const r=await app({method:'POST',path:'/api/bookings',body:Buffer.from(JSON.stringify(form())),ip:'qa'});assert.equal(r.status,503);
 const retry=await t.request('POST','/api/bookings',form());assert.equal(retry.status,201);t.store.close();
});
test('invalid slot boundaries, missing consent and cross-origin requests are rejected',async()=>{
 const t=setup();assert.equal((await t.request('POST','/api/bookings',form({start:'2026-10-21T16:17:00.000Z'}))).status,400);
 assert.equal((await t.request('POST','/api/bookings',form({privacyConsent:false}))).status,400);
 assert.equal((await t.request('POST','/api/bookings',form(),{}, {origin:'https://other.example'})).status,403);t.store.close();
});
test('two SQLite connections preserve a single slot owner',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hairflix-')),path=join(dir,'bookings.sqlite'),now=Date.parse('2026-10-20T18:00:00Z');
 const a=new SqliteStore(path,()=>now),b=new SqliteStore(path,()=>now);
 const base={id:'a',location:'university',start:START,end:'2026-10-21T16:30:00Z',seat:0,status:'awaiting_deposit'};
 const results=await Promise.all([a.reserve(base,60,now),b.reserve({...base,id:'b'},60,now)]);assert.deepEqual(results,[true,false]);a.close();b.close();rmSync(dir,{recursive:true,force:true});
});
