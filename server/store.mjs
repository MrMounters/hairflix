const PREFIX='hairflix:v1:';
const name=k=>PREFIX+k;
const dateOf=start=>new Date(new Date(start).getTime()-7*3600000).toISOString().slice(0,10);
export const unitKeys=(location,start,end,seat=0)=>{
 const result=[];
 for(let t=Date.parse(start);t<Date.parse(end);t+=300000)result.push(name(`slot:${location}:${seat}:${t}`));
 return result;
};
const holdScript=`
for i=2,#KEYS do if redis.call('EXISTS',KEYS[i])==1 then return 0 end end
for i=2,#KEYS do redis.call('SET',KEYS[i],ARGV[1],'EX',ARGV[3]) end
redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[4])
redis.call('SADD',ARGV[5],ARGV[1]);redis.call('EXPIRE',ARGV[5],ARGV[4]);return 1`;
const releaseScript=`
for i=2,#KEYS do if redis.call('GET',KEYS[i])==ARGV[1] then redis.call('DEL',KEYS[i]) end end
local v=redis.call('GET',KEYS[1]);if v then local b=cjson.decode(v);if b.status~='confirmed' then b.status=ARGV[2];redis.call('SET',KEYS[1],cjson.encode(b),'KEEPTTL') end end
return 1`;
const patchScript=`
local v=redis.call('GET',KEYS[1]);if not v then return 0 end
local b=cjson.decode(v);local p=cjson.decode(ARGV[1]);for k,val in pairs(p) do b[k]=val end
redis.call('SET',KEYS[1],cjson.encode(b),'KEEPTTL');return 1`;
const confirmScript=`
local v=redis.call('GET',KEYS[1]);if not v then return 'missing' end
local b=cjson.decode(v);if b.status=='confirmed' then return 'confirmed' end
b.paidAt=ARGV[2];b.paymentId=ARGV[3]
for i=2,#KEYS do local occupied=redis.call('GET',KEYS[i]);if occupied and occupied~=b.id then b.status='payment_review';redis.call('SET',KEYS[1],cjson.encode(b),'KEEPTTL');return 'payment_review' end end
for i=2,#KEYS do redis.call('SET',KEYS[i],b.id,'EX',ARGV[1]) end
b.status='confirmed';b.paidAt=ARGV[2];b.paymentId=ARGV[3];redis.call('SET',KEYS[1],cjson.encode(b),'KEEPTTL');return 'confirmed'`;
export class RedisStore {
 constructor(url,token,fetcher=fetch){this.url=url.replace(/\/$/,'');this.token=token;this.fetcher=fetcher;}
 async command(parts){
  const r=await this.fetcher(this.url,{method:'POST',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},body:JSON.stringify(parts),signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw new Error('Booking storage unavailable');
  const json=await r.json();if(json.error)throw new Error('Booking storage unavailable');return json.result;
 }
 async occupancy(keys){return keys.length?await this.command(['MGET',...keys]):[];}
 async reserve(booking,holdSeconds,now=Date.now()){
  const keys=unitKeys(booking.location,booking.start,booking.end,booking.seat);
  const recordSeconds=Math.max(86400,Math.ceil((Date.parse(booking.end)-now)/1000)+30*86400);
  const ok=await this.command(['EVAL',holdScript,keys.length+1,name('booking:'+booking.id),...keys,booking.id,JSON.stringify(booking),holdSeconds,recordSeconds,name('day:'+dateOf(booking.start))]);
  return ok===1;
 }
 async get(id){const raw=await this.command(['GET',name('booking:'+id)]);return raw?JSON.parse(raw):null;}
 async patch(id,patch){return this.command(['EVAL',patchScript,1,name('booking:'+id),JSON.stringify(patch)]);}
 async release(booking,status='checkout_failed'){const keys=unitKeys(booking.location,booking.start,booking.end,booking.seat);return this.command(['EVAL',releaseScript,keys.length+1,name('booking:'+booking.id),...keys,booking.id,status]);}
 async confirm(booking,now,paymentId){const keys=unitKeys(booking.location,booking.start,booking.end,booking.seat);const ttl=Math.max(86400,Math.ceil((Date.parse(booking.end)-now)/1000)+86400);return this.command(['EVAL',confirmScript,keys.length+1,name('booking:'+booking.id),...keys,ttl,new Date(now).toISOString(),paymentId]);}
 async list(date){const ids=await this.command(['SMEMBERS',name('day:'+date)]);const raw=ids.length?await this.command(['MGET',...ids.map(id=>name('booking:'+id))]):[];return raw.filter(Boolean).map(x=>JSON.parse(x));}
 async rateLimit(key,limit,seconds){const v=await this.command(['EVAL',`local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end;return n`,1,name('rate:'+key),seconds]);return v<=limit;}
}
