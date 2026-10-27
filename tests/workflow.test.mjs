import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/app/workflow.js',import.meta.url),'utf8');const c=vm.createContext({});vm.runInContext(source.slice(0,source.indexOf('// The explicitly')),c);
test('day closeout counts actual settled totals including tips and distinguishes outstanding approvals',()=>{const b={date:'2026-10-27',barber:'alex',status:'completed',ticket:{approval:{totalCents:5200}},settlement:{status:'paid',amountCents:5200}};const list=[b,{...b,settlement:null},{...b,date:'2026-10-28'},{...b,barber:'jordan'},{...b,status:'cancelled'},{...b,ticket:{status:'awaiting_approval'}},{...b,settlement:{status:'paid',amountCents:3200}}];const totals=c.closedVisitTotals(list,'2026-10-27','alex');assert.equal(totals.completed,3);assert.equal(totals.collectedCents,5200);assert.equal(totals.outstanding,2);});
