import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/app/owner.js',import.meta.url),'utf8'),context=vm.createContext({});vm.runInContext(source.slice(source.indexOf('function ownerDaySummary'),source.indexOf('function ownerVisitStatus')),context);
test('owner daily collection separates paid totals from approvals and ignores other days/cancellations',()=>{const b={date:'2026-10-27',status:'completed',ticket:{approval:{totalCents:5200}},settlement:{status:'paid',amountCents:5200}};const r=context.ownerDaySummary([b,{...b,settlement:null},{...b,date:'2026-10-28'},{...b,status:'cancelled'},{date:b.date,status:'in_service',ticket:{status:'awaiting_approval'}},{date:b.date,status:'confirmed'}],b.date);assert.equal(r.collectedCents,5200);assert.equal(r.outstandingCents,5200);assert.equal(r.appointments,4);assert.equal(r.completed,2);assert.equal(r.awaitingApproval,1);});
