(function(root){
 function requireNumber(n,min,max,label){n=Number(n);if(!Number.isFinite(n)||n<min||n>max)throw Error(label+' must be between '+min+' and '+max+'.');return n;}
 function validatePolicy(p){return {enabled:!!p.enabled,mode:['full','fixed','percent'].includes(p.mode)?p.mode:'fixed',amount:requireNumber(p.amount,0,p.mode==='percent'?100:10000,'Deposit'),noticeHours:requireNumber(p.noticeHours,0,168,'Notice hours'),reschedule:!!p.reschedule,rescheduleHours:requireNumber(p.rescheduleHours,0,168,'Reschedule notice')};}
 function depositCents(total,p){if(!p.enabled)return 0;return p.mode==='full'?total:p.mode==='percent'?Math.round(total*p.amount/100):Math.min(total,Math.round(p.amount*100));}
 function appointmentAt(b){const [clock,meridiem]=b.time.split(' ');let [h,m]=clock.split(':').map(Number);h=h%12+(meridiem==='PM'?12:0);return Date.parse(b.date+'T'+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':00-07:00');}
 function cancellation(b,p,now=Date.now()){const deadline=appointmentAt(b)-p.noticeHours*3600000;return {deadline,free:now<=deadline,remaining:Math.max(0,deadline-now),started:now>=appointmentAt(b)};}
 function reschedulable(b,p,role,now=Date.now()){return role!=='Customer'||(p.reschedule&&now<=appointmentAt(b)-p.rescheduleHours*3600000);}
 function accessible(b,role,staffId){return role==='Owner HQ'||(role==='Barber Pro'?b.barber===staffId:role==='Customer'&&b.client==='John B.');}
 const rules={requireNumber,validatePolicy,depositCents,appointmentAt,cancellation,reschedulable,accessible};root.HFAppRules=rules;if(typeof module!=='undefined')module.exports=rules;
})(typeof window!=='undefined'?window:globalThis);
