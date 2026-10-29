import test from 'node:test';
import assert from 'node:assert/strict';
await import('../dist/app/operations-rules.js');
const R=globalThis.HFOperations;
const slot={barber:'alex',date:'2026-11-20',time:'3:00 PM',duration:95,now:0};
test('whole multi-service duration must fit hours, blocks and existing visits',()=>{
 assert.equal(R.scheduleError(slot),'');
 assert.match(R.scheduleError({...slot,hours:[540,960]}),/full appointment/);
 assert.match(R.scheduleError({...slot,blocks:[{barber:'alex',date:slot.date,start:'16:30',end:'17:00'}]}),/blocked/);
 assert.match(R.scheduleError({...slot,bookings:[{id:'b',barber:'alex',date:slot.date,time:'4:30 PM',durationMin:30}]}),/already booked/);
});
test('adjacent visits allowed, cancelled released, own reschedule ignored, other barber independent',()=>{
 const b={id:'a',barber:'alex',date:slot.date,time:'3:00 PM',durationMin:30,status:'confirmed'};
 assert.equal(R.scheduleError({...slot,time:'3:30 PM',bookings:[b]}),'');
 assert.equal(R.scheduleError({...slot,bookings:[{...b,status:'cancelled'}]}),'');
 assert.equal(R.scheduleError({...slot,bookings:[b],ignoreId:'a'}),'');
 assert.equal(R.scheduleError({...slot,bookings:[{...b,barber:'jordan'}]}),'');
 assert.match(R.scheduleError({...slot,hours:null}),/booking hours/);
});
test('full-day blocks, quarter-hour starts and past dates enforced',()=>{
 assert.match(R.scheduleError({...slot,blocks:[{barber:'alex',date:slot.date,start:'00:00',end:'23:59'}]}),/blocked/);
 assert.match(R.scheduleError({...slot,time:'3:10 PM'}),/15-minute/);
 assert.match(R.scheduleError({...slot,date:'2026-02-30'}),/valid date/);
 assert.match(R.scheduleError({...slot,now:Date.parse('2026-11-21T00:00Z')}),/future/);
});
test('reconciliation retains independent bookings, payment status and concurrent message receipts',()=>{
 const base={bookings:[{id:'a',status:'confirmed',date:'2026-11-20'}],extras:{threads:[{id:'t',messages:[{id:'m',body:'Hello',readBy:['Customer']}]}]}};
 const local=structuredClone(base),remote=structuredClone(base);
 local.bookings[0].date='2026-11-21';remote.bookings[0].status='paid';remote.bookings.push({id:'b',status:'confirmed'});
 local.extras.threads[0].messages[0].readBy.push('barber:alex');remote.extras.threads[0].messages.push({id:'m2',body:'Welcome',readBy:['barber:alex']});
 const result=R.merge(base,local,remote);
 assert.deepEqual(result.bookings,[{id:'a',status:'paid',date:'2026-11-21'},{id:'b',status:'confirmed'}]);
 assert.equal(result.extras.threads[0].messages.length,2);assert.deepEqual(result.extras.threads[0].messages[0].readBy,['Customer','barber:alex']);
});
