// Appointment-first staff workflow. Approval never silently records a payment.
function closedVisitTotals(list,date,barber){
 const visits=list.filter(b=>b.date===date&&b.barber===barber&&b.status!=='cancelled'&&b.ticket?.approval);
 const settled=visits.filter(b=>b.settlement?.status==='paid'&&Number.isSafeInteger(b.settlement.amountCents)&&b.settlement.amountCents===b.ticket.approval.totalCents);
 return {completed:visits.length,collectedCents:settled.reduce((n,b)=>n+b.settlement.amountCents,0),outstanding:visits.length-settled.length};
}
// The explicitly requested completed morning fixture is a recorded cash example.
if(!extras.morningCashExample){const b=bookings.find(b=>b.id.startsWith('demo-live')&&b.time==='9:00 AM'&&b.ticket?.approval?.totalCents===5200);if(b)b.settlement={method:'cash',status:'paid',amountCents:5200,source:'example',at:Date.now()};extras.morningCashExample=true;save();}
function rememberAppointmentOrigin(){if(['home','pCalendar','calendar'].includes(state.view))state.visitReturn={view:state.view,date:state.calendarDate,y:window.scrollY};}
function openAppointment(id){
 if(state.role==='Customer')return;
 let b=bookings.find(b=>b.id===id);
 if(!b&&id.startsWith('sample')){openTicketFor(id);b=bookings.find(b=>b.id===id);if(b){delete checked[b.id];b.status='confirmed';save();}}
 if(!b||state.role==='Barber Pro'&&b.barber!==activeBarberId())return;
 state.visitId=b.id;
 go(b.ticket?.approval?'staffReceipt':checked[b.id]?'pTicket':'pAppointment');
}
function staffReceipt(){const b=visitFor();if(!b?.ticket?.approval)return appointmentDetail();const a=b.ticket.approval,paid=b.settlement?.status==='paid';return `${head('Visit receipt.',paid?'Completed · Payment recorded':'Services approved · Payment outstanding')}${visitSummary(b)}<section class="panel">${lineSummary(a.lines)}<div class="line-item"><span>Services</span><strong>${cents(a.subtotalCents)}</strong></div><div class="line-item"><span>Tip</span><strong>${cents(a.tipCents)}</strong></div><div class="line-item total"><span>Total</span><strong>${cents(a.totalCents)}</strong></div>${paid?`<p class="notice">${b.settlement.method==='cash'?'Cash payment recorded':'Payment recorded'} · ${cents(b.settlement.amountCents)}</p>`:`<p class="notice">This approved total has not been recorded as paid.</p><button class="btn" data-workflow="cash" data-id="${esc(b.id)}">Record cash payment · ${cents(a.totalCents)}</button>`}</section>`;}
const workflowExtra=renderExtraView;renderExtraView=function(v){if(v==='staffReceipt')return isStaff()?staffReceipt():head('Staff access required.','');if(v==='pTickets')return proCalendar(state.role==='Owner HQ');return workflowExtra(v);};
const workflowRender=render;render=function(){workflowRender();
 if(state.role==='Barber Pro'&&state.view==='home'){
 const total=closedVisitTotals(bookings,state.calendarDate,activeBarberId());
 const metric=[...document.querySelectorAll('.metric')].find(el=>el.querySelector('span')?.textContent==='Completed visits');
 if(metric){metric.querySelector('strong').textContent=`${total.completed} (${cents(total.collectedCents)})`;metric.querySelector('small').textContent='Closed total including tips'+(total.outstanding?` · ${total.outstanding} awaiting payment`:'');}
 }
 if(isStaff()&&['pAppointment','pTicket','pFinalize','staffReceipt'].includes(state.view)){
 document.querySelectorAll('[data-page="pTickets"]').forEach(el=>el.remove());
 const b=visitFor();if(b?.ticket?.status==='approved'&&state.view==='pTicket'){state.view='staffReceipt';render();return;}
 const label=state.visitReturn?.view==='home'?'Today':'Calendar';
 document.querySelector('main')?.insertAdjacentHTML('afterbegin',`<button class="back" data-workflow="back">${icon('back')} Back to ${label}</button>`);
 }
 if(isStaff())document.querySelectorAll('.slot-block[data-workflow],.appointment-entry').forEach(el=>{const b=bookings.find(b=>b.id===el.dataset.id);if(b&&!b.ticket?.approval&&b.ticket?.status&&b.ticket.status!=='draft'){const label={awaiting_approval:'Awaiting client approval',finalized:'Ready to send',changes_requested:'Changes requested'}[b.ticket.status];if(label)el.querySelector('.details')?.insertAdjacentHTML('beforeend',`<small class="workflow-status">${label}</small>`);}});
};
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-workflow]');
 if(el?.dataset.workflow==='back'){e.preventDefault();e.stopImmediatePropagation();const target=state.visitReturn||{view:'pCalendar',date:state.calendarDate,y:0};state.calendarDate=target.date;go(target.view);requestAnimationFrame(()=>window.scrollTo(0,target.y));return;}
 if(el?.dataset.workflow==='cash'){e.preventDefault();e.stopImmediatePropagation();const b=bookings.find(b=>b.id===el.dataset.id);if(!b?.ticket?.approval||!isStaff()||state.role==='Barber Pro'&&b.barber!==activeBarberId())return;b.settlement={method:'cash',status:'paid',amountCents:b.ticket.approval.totalCents,at:Date.now(),by:state.role};save();render();toast('Cash payment recorded.');return;}
 if(el?.dataset.workflow==='open'){
 rememberAppointmentOrigin();if(e.target.closest('button,a,input,select'))return;e.preventDefault();e.stopImmediatePropagation();openAppointment(el.dataset.id);return;
 }
 if(e.target.closest('[data-action=checkin],[data-x=start-ticket],[data-x=open-visit]'))rememberAppointmentOrigin();
},true);
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-workflow=open]')){e.preventDefault();e.target.click();}});
render();
