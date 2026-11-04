export type Role = 'customer' | 'barber' | 'owner';
export type Service = {id:string;name:string;minutes:number;cents:number};
export type Barber = {id:string;name:string};
export type Visit = {id:string;client:string;barberId:string;date:string;start:number;services:Service[];status:'booked'|'in_service'|'approval'|'approved'|'paid'|'cancelled'|'needs_reassignment';tipCents:number;paidAt?:number;paymentSource?:'simulation'};
export type Block = {id:string;barberId:string;date:string;start:number;end:number;reason:string;kind:'break'|'absence'};
export type Message = {id:string;threadId:string;from:Role;text:string;at:number;readBy:Role[];visitId?:string};
export type Thread = {id:string;client:string;barberId:string};
export type Data = {version:1;visits:Visit[];blocks:Block[];threads:Thread[];messages:Message[];barberShare:number};
export const barbers:Barber[]=[{id:'lara',name:'Lara'},{id:'jose',name:'Jose'},{id:'watkins',name:'Watkins'}];
export const services:Service[]=[{id:'cut',name:'Signature haircut',minutes:30,cents:3000},{id:'combo',name:'Haircut + beard',minutes:45,cents:4000},{id:'beard',name:'Beard sculpt',minutes:20,cents:2000},{id:'kids',name:'Kids haircut',minutes:30,cents:2500},{id:'brows',name:'Eyebrows',minutes:10,cents:1200},{id:'facial',name:'Hydrafacial',minutes:60,cents:12000}];
export const money=(cents:number)=>'$'+(cents/100).toFixed(2);
export const clock=(n:number)=>`${Math.floor(n/60)%12||12}:${String(n%60).padStart(2,'0')} ${n>=720?'PM':'AM'}`;
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Phoenix',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function addDays(date:string,n:number){return new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
export function pretty(date:string){return new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'});}
export const uid=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
export const duration=(v:Pick<Visit,'services'>)=>v.services.reduce((n,s)=>n+s.minutes,0);
export const subtotal=(v:Pick<Visit,'services'>)=>v.services.reduce((n,s)=>n+s.cents,0);
export const total=(v:Visit)=>subtotal(v)+v.tipCents;
const overlap=(a:number,b:number,c:number,d:number)=>a<d&&c<b;
export function slotError(data:Data,barberId:string,date:string,start:number,length:number,ignoreId?:string,now=Date.now()):string{
 const ms=Date.parse(date+'T12:00:00Z');
 if(!barbers.some(b=>b.id===barberId)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==date||!Number.isInteger(start)||start%15||!Number.isFinite(length)||length<=0)return 'Choose a valid barber, date and time.';
 const at=Date.parse(`${date}T${String(Math.floor(start/60)).padStart(2,'0')}:${String(start%60).padStart(2,'0')}:00-07:00`);
 if(at<=now)return 'Choose a future time.';
 if(start<540||start+length>1080)return 'The entire visit must fit between 9 AM and 6 PM.';
 if(data.blocks.some(b=>b.barberId===barberId&&b.date===date&&overlap(start,start+length,b.start,b.end)))return 'This time is blocked.';
 if(data.visits.some(v=>v.id!==ignoreId&&v.barberId===barberId&&v.date===date&&v.status!=='cancelled'&&overlap(start,start+length,v.start,v.start+duration(v))))return 'This barber already has an appointment.';
 return '';
}
export function seedData():Data{
 const date=today(),tomorrow=addDays(date,1),rows:[string,string,number,string][]=[['Alex Morgan','lara',600,'cut'],['Ryan Smith','lara',690,'combo'],['Marcus Reed','lara',840,'beard'],['Daniel Lee','jose',630,'cut'],['Sam Taylor','watkins',900,'combo']];
 const visits:Visit[]=rows.map(([client,barberId,start,service],i)=>({id:'sample-'+i,client,barberId,start,date,services:[{...services.find(s=>s.id===service)!}],status:i===0?'in_service':'booked',tipCents:0}));
 visits.push({id:'john-request',client:'John B.',barberId:'lara',date,start:555,services:[{...services[0]}],status:'approval',tipCents:0},{id:'john-next',client:'John B.',barberId:'lara',date:tomorrow,start:900,services:[{...services[1]}],status:'booked',tipCents:0});
 const threads:Thread[]=[{id:'john',client:'John B.',barberId:'lara'},{id:'alex',client:'Alex Morgan',barberId:'lara'},{id:'ryan',client:'Ryan Smith',barberId:'lara'},{id:'marcus',client:'Marcus Reed',barberId:'lara'}];
 const now=Date.now();return {version:1,visits,threads,blocks:[{id:'lunch',barberId:'lara',date,start:750,end:810,reason:'Lunch',kind:'break'}],barberShare:60,messages:[{id:'welcome',threadId:'john',from:'barber',text:'Your final ticket is ready. Review your services and choose a tip.',at:now-60000,readBy:['barber'],visitId:'john-request'},...['Same length on top, please.','A low taper too.','See you soon!'].map((text,i)=>({id:'alex-'+i,threadId:'alex',from:'customer' as Role,text,at:now-600000+i*60000,readBy:['customer' as Role]})),{id:'ryan-msg',threadId:'ryan',from:'customer',text:'Can we add the beard trim?',at:now-180000,readBy:['customer']},{id:'marcus-msg',threadId:'marcus',from:'customer',text:'First visit. Where should I park?',at:now-120000,readBy:['customer']}]};
}
export type Action = {type:'book';visit:Visit}|{type:'block';block:Block}|{type:'unblock';id:string}|{type:'reassign';id:string;barberId:string;notify:boolean}|{type:'absence';barberId:string;date:string}|{type:'reschedule';id:string;date:string;start:number}|{type:'start'|'request'|'cancel';id:string}|{type:'approve';id:string;tipCents:number}|{type:'pay';id:string}|{type:'message';threadId:string;from:Role;text:string}|{type:'read';threadId:string;role:Role}|{type:'share';value:number};
function threadFor(data:Data,v:Visit):Thread{let thread=data.threads.find(t=>t.client===v.client&&t.barberId===v.barberId);if(!thread){thread={id:uid(),client:v.client,barberId:v.barberId};data.threads.push(thread);}return thread;}
function announce(data:Data,v:Visit,text:string){const t=threadFor(data,v);data.messages.push({id:uid(),threadId:t.id,from:'barber',text,at:Date.now(),readBy:['barber'],visitId:v.id});}
export function transition(current:Data,action:Action,now=Date.now()):Data{
 const d:Data=JSON.parse(JSON.stringify(current)),v='id'in action?d.visits.find(v=>v.id===action.id):undefined;
 switch(action.type){
 case 'book':{const b=action.visit;if(!b.client.trim()||!b.services.length||b.services.some(s=>!services.some(x=>x.id===s.id)||s.minutes<=0||s.cents<0))throw Error('Add a client and choose services.');if(d.visits.some(v=>v.id===b.id))throw Error('This visit already exists.');const error=slotError(d,b.barberId,b.date,b.start,duration(b),undefined,now);if(error)throw Error(error);d.visits.push({...b,services:b.services.map(s=>({...s})),status:'booked',tipCents:0});announce(d,b,'Appointment booked · '+pretty(b.date)+' at '+clock(b.start));break;}
 case 'block':{const b=action.block;if(!barbers.some(x=>x.id===b.barberId)||!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!Number.isFinite(Date.parse(b.date+'T12:00Z'))||addDays(b.date,0)!==b.date||b.date<today()||!Number.isInteger(b.start)||!Number.isInteger(b.end)||b.start%15||b.end%15||b.start<0||b.end>1440||b.end<=b.start)throw Error('Choose valid dates and quarter-hour times.');if(d.visits.some(v=>v.barberId===b.barberId&&v.date===b.date&&v.status!=='cancelled'&&overlap(b.start,b.end,v.start,v.start+duration(v))))throw Error('An appointment overlaps this block. Reassign it first.');if(d.blocks.some(x=>x.barberId===b.barberId&&x.date===b.date&&overlap(b.start,b.end,x.start,x.end)))throw Error('This time is already blocked.');d.blocks.push(b);break;}
 case 'unblock':d.blocks=d.blocks.filter(b=>b.id!==action.id);break;
 case 'absence':{if(!barbers.some(b=>b.id===action.barberId)||action.date<today()||!/^\d{4}-\d{2}-\d{2}$/.test(action.date)||!Number.isFinite(Date.parse(action.date+'T12:00Z'))||addDays(action.date,0)!==action.date)throw Error('Choose a valid absence date.');if(!d.blocks.some(b=>b.kind==='absence'&&b.barberId===action.barberId&&b.date===action.date))d.blocks.push({id:uid(),kind:'absence',barberId:action.barberId,date:action.date,start:0,end:1440,reason:'Reported absence'});for(const item of d.visits)if(item.barberId===action.barberId&&item.date===action.date&&item.status==='booked')item.status='needs_reassignment';break;}
 case 'reassign':{if(!v||!['booked','needs_reassignment'].includes(v.status))throw Error('Only unstarted appointments can be reassigned.');const error=slotError(d,action.barberId,v.date,v.start,duration(v),v.id,now);if(error)throw Error(error);const oldName=barbers.find(b=>b.id===v.barberId)?.name;v.barberId=action.barberId;v.status='booked';if(action.notify)announce(d,v,`Barber changed from ${oldName} to ${barbers.find(b=>b.id===v.barberId)?.name}. ${pretty(v.date)} · ${clock(v.start)}. Your booked price is unchanged.`);break;}
 case 'reschedule':{if(!v||!['booked','needs_reassignment'].includes(v.status))throw Error('Only unstarted appointments can move.');const error=slotError(d,v.barberId,action.date,action.start,duration(v),v.id,now);if(error)throw Error(error);v.date=action.date;v.start=action.start;v.status='booked';announce(d,v,'Appointment rescheduled · '+pretty(v.date)+' at '+clock(v.start));break;}
 case 'start':if(!v||v.status!=='booked')throw Error('Choose a booked visit.');v.status='in_service';break;
 case 'request':if(!v||v.status!=='in_service')throw Error('Start the visit first.');v.status='approval';announce(d,v,'Your final services are ready. Review your ticket and choose a tip.');break;
 case 'approve':if(!v||v.status!=='approval'||!Number.isInteger(action.tipCents)||action.tipCents<0||action.tipCents>100000)throw Error('Review the latest ticket and choose a valid tip.');v.tipCents=action.tipCents;v.status='approved';break;
 case 'pay':if(!v||v.status!=='approved')throw Error('Approve the services before payment.');v.status='paid';v.paymentSource='simulation';v.paidAt=now;break;
 case 'cancel':if(!v||!['booked','needs_reassignment'].includes(v.status))throw Error('Only unstarted appointments can be cancelled.');v.status='cancelled';announce(d,v,'Appointment cancelled. Contact the shop for help choosing a new time.');break;
 case 'message':if(!d.threads.some(t=>t.id===action.threadId)||!action.text.trim())throw Error('Choose a conversation and write a message.');d.messages.push({id:uid(),threadId:action.threadId,from:action.from,text:action.text.trim().slice(0,1000),at:now,readBy:[action.from]});break;
 case 'read':for(const m of d.messages)if(m.threadId===action.threadId&&!m.readBy.includes(action.role))m.readBy.push(action.role);break;
 case 'share':if(!Number.isInteger(action.value)||action.value<0||action.value>100)throw Error('Choose a percentage from 0 to 100.');d.barberShare=action.value;break;
 }
 return d;
}
