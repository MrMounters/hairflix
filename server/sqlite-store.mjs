// Local development/test adapter only. Production never falls back to local disk.
import {DatabaseSync} from 'node:sqlite';
import {unitKeys} from './store.mjs';
export class SqliteStore {
 constructor(path=':memory:',clock=()=>Date.now()){
  this.db=new DatabaseSync(path);this.clock=clock;
  this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS slots(key TEXT PRIMARY KEY, booking_id TEXT NOT NULL, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, value INTEGER NOT NULL, expires INTEGER NOT NULL);');
 }
 clean(){const now=this.clock();this.db.prepare('DELETE FROM slots WHERE expires<=?').run(now);this.db.prepare('DELETE FROM bookings WHERE expires<=?').run(now);}
 async occupancy(keys){this.clean();const q=this.db.prepare('SELECT booking_id FROM slots WHERE key=?');return keys.map(k=>q.get(k)?.booking_id??null);}
 async reserve(booking,holdSeconds,now=this.clock()){
  this.db.exec('BEGIN IMMEDIATE');
  try{
   this.clean();const keys=unitKeys(booking.location,booking.start,booking.end,booking.seat);
   const find=this.db.prepare('SELECT key FROM slots WHERE key=?');
   if(keys.some(k=>find.get(k))){this.db.exec('ROLLBACK');return false;}
   this.db.prepare('INSERT INTO bookings VALUES(?,?,?)').run(booking.id,JSON.stringify(booking),Date.parse(booking.end)+30*86400000);
   const insert=this.db.prepare('INSERT INTO slots VALUES(?,?,?)');for(const k of keys)insert.run(k,booking.id,now+holdSeconds*1000);
   this.db.exec('COMMIT');return true;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 async get(id){this.clean();const row=this.db.prepare('SELECT data FROM bookings WHERE id=?').get(id);return row?JSON.parse(row.data):null;}
 async patch(id,patch){const b=await this.get(id);if(!b)return 0;Object.assign(b,patch);this.db.prepare('UPDATE bookings SET data=? WHERE id=?').run(JSON.stringify(b),id);return 1;}
 async release(b,status='checkout_failed'){this.db.prepare('DELETE FROM slots WHERE booking_id=?').run(b.id);const current=await this.get(b.id);if(current&&current.status!=='confirmed')await this.patch(b.id,{status});}
 async confirm(b,now,paymentId){
  this.db.exec('BEGIN IMMEDIATE');
  try{
   this.clean();const row=this.db.prepare('SELECT data FROM bookings WHERE id=?').get(b.id);
   if(!row){this.db.exec('ROLLBACK');return 'missing';}
   const current=JSON.parse(row.data);if(current.status==='confirmed'){this.db.exec('COMMIT');return 'confirmed';}
   const keys=unitKeys(b.location,b.start,b.end,b.seat),find=this.db.prepare('SELECT booking_id FROM slots WHERE key=?');
   let status='confirmed';if(keys.some(k=>{const row=find.get(k);return row&&row.booking_id!==b.id;}))status='payment_review';
   if(status==='confirmed'){const q=this.db.prepare('INSERT OR REPLACE INTO slots VALUES(?,?,?)');for(const k of keys)q.run(k,b.id,Date.parse(b.end)+86400000);}
   Object.assign(current,{status,paidAt:new Date(now).toISOString(),paymentId});
   this.db.prepare('UPDATE bookings SET data=? WHERE id=?').run(JSON.stringify(current),b.id);this.db.exec('COMMIT');return status;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 async list(date){this.clean();return this.db.prepare('SELECT data FROM bookings').all().map(r=>JSON.parse(r.data)).filter(b=>new Date(Date.parse(b.start)-7*3600000).toISOString().startsWith(date));}
 async rateLimit(key,limit,seconds){const now=this.clock();const row=this.db.prepare('SELECT * FROM rate_limits WHERE key=?').get(key);const value=!row||row.expires<=now?1:row.value+1;this.db.prepare('INSERT OR REPLACE INTO rate_limits VALUES(?,?,?)').run(key,value,!row||row.expires<=now?now+seconds*1000:row.expires);return value<=limit;}
 close(){this.db.close();}
}
