/* Shared, deterministic scheduling and state reconciliation rules. */
(function(root){
 const minute=t=>{if(/^\d{2}:\d{2}$/.test(t||''))return Number(t.slice(0,2))*60+Number(t.slice(3));const m=/^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(t||'');return m?(Number(m[1])%12+(m[3]==='PM'?12:0))*60+Number(m[2]):NaN;};
 const duration=b=>b.bookedServices?.reduce((n,s)=>n+Number(s.min),0)||b.durationMin||30;
 function scheduleError({barber,date,time,duration:len,ignoreId,bookings=[],blocks=[],hours=[540,1140],now=Date.now()}){
  const start=minute(time),d=new Date(date+'T12:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(+d)||d.toISOString().slice(0,10)!==date||!barber||!Number.isFinite(start)||start%15||!Number.isFinite(len)||len<=0)return 'Choose a valid date, service and time in 15-minute steps.';
  const at=Date.parse(date+'T'+String(Math.floor(start/60)).padStart(2,'0')+':'+String(start%60).padStart(2,'0')+':00-07:00');
  if(at<=now)return 'Choose a future appointment time.';
  if(!hours||start<hours[0]||start+len>hours[1])return 'The full appointment must fit within booking hours.';
  if(blocks.some(b=>b.barber===barber&&b.date===date&&minute(b.start)<start+len&&minute(b.end)>start))return 'This time is blocked. Choose another time.';
  if(bookings.some(b=>b.id!==ignoreId&&b.barber===barber&&b.date===date&&!['cancelled','expired','checkout_failed'].includes(b.status)&&minute(b.time)<start+len&&minute(b.time)+duration(b)>start))return 'That time is already booked. Choose another time.';
  return '';
 }
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 function merge(base,local,remote){
  if(equal(local,base))return remote;
  if(equal(remote,base)||equal(local,remote))return local;
  if(Array.isArray(local)&&Array.isArray(remote)){
   const prior=Array.isArray(base)?base:[];
   const key=x=>x&&typeof x==='object'&&x.id?'id:'+x.id:JSON.stringify(x);
   const a=new Map(prior.map(x=>[key(x),x])),b=new Map(local.map(x=>[key(x),x])),c=new Map(remote.map(x=>[key(x),x]));
   return [...new Set([...c.keys(),...b.keys()])].flatMap(k=>{if(a.has(k)&&(!b.has(k)||!c.has(k)))return [];return [b.has(k)&&c.has(k)?merge(a.get(k),b.get(k),c.get(k)):b.has(k)?b.get(k):c.get(k)];});
  }
  if(local&&remote&&typeof local==='object'&&typeof remote==='object'&&!Array.isArray(local)&&!Array.isArray(remote)){
   const result={};for(const k of new Set([...Object.keys(remote),...Object.keys(local)])){const value=merge(base?.[k],local[k],remote[k]);if(value!==undefined)result[k]=value;}return result;
  }
  return local;
 }
 root.HFOperations={minute,duration,scheduleError,merge};
})(typeof window!=='undefined'?window:globalThis);
