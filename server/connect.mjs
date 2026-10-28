import {createHmac,createHash,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {RedisStore} from './store.mjs';
const PREFIX='hairflix:connect:sandbox:v1:';
const COOKIE='hf_connect_sandbox';
const json=value=>{try{return JSON.parse(value||'{}');}catch{return {};}};
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function passwordHash(password,salt=randomBytes(16).toString('hex')){return `scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
export function verifyPassword(password,encoded){const [type,salt,digest]=String(encoded||'').split(':');return type==='scrypt'&&/^[a-f0-9]{32}$/.test(salt||'')&&/^[a-f0-9]{128}$/.test(digest||'')&&same(passwordHash(password,salt),encoded);}
export function createConnectApp(env={},deps={}){
 const clock=deps.clock||Date.now,users=json(env.CONNECT_SANDBOX_USERS_JSON),store=deps.store||(env.UPSTASH_REDIS_REST_URL&&env.UPSTASH_REDIS_REST_TOKEN?new RedisStore(env.UPSTASH_REDIS_REST_URL,env.UPSTASH_REDIS_REST_TOKEN):null);
 const missing=()=>[env.CONNECT_ENABLED!=='true'&&'CONNECT_ENABLED',env.CONNECT_MODE!=='sandbox'&&'CONNECT_MODE=sandbox',!/^([sr]k)_test_/.test(env.STRIPE_CONNECT_API_KEY||'')&&'STRIPE_CONNECT_API_KEY (sandbox)',!/^pk_test_/.test(env.STRIPE_CONNECT_PUBLISHABLE_KEY||'')&&'STRIPE_CONNECT_PUBLISHABLE_KEY (sandbox)',!env.PUBLIC_ORIGIN&&'PUBLIC_ORIGIN',!(env.CONNECT_SESSION_SECRET?.length>=32)&&'CONNECT_SESSION_SECRET',!Object.keys(users).length&&'CONNECT_SANDBOX_USERS_JSON',!store&&'UPSTASH_REDIS_REST_URL / TOKEN'].filter(Boolean);
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const response=(status,data,extra={})=>({status,headers:{...headers,...extra},body:JSON.stringify(data)});
 const cookie=(value,age=28800)=>`${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/api/connect; Max-Age=${age}${env.PUBLIC_ORIGIN?.startsWith('https:')?'; Secure':''}`;
 const sign=text=>createHmac('sha256',env.CONNECT_SESSION_SECRET).update(text).digest('base64url');
 const userFor=req=>{try{const raw=(req.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1),[payload,signature]=String(raw||'').split('.');if(!signature||!same(sign(payload),signature))return null;const session=json(Buffer.from(payload,'base64url').toString()),user=users[session.username];return session.exp>clock()&&user&&same(session.version,createHash('sha256').update(user.passwordHash||'').digest('hex'))?{...user,username:session.username}:null;}catch{return null;}};
 async function stripe(){if(deps.stripe)return deps.stripe;const {default:Stripe}=await import('stripe');return new Stripe(env.STRIPE_CONNECT_API_KEY,{apiVersion:'2026-08-26.dahlia',maxNetworkRetries:2});}
 const accountKey=u=>PREFIX+'account:'+u.id;
 async function accountFor(u){return u.accountId||await store.command(['GET',accountKey(u)]);}
 const validUser=u=>u&&/^[a-z0-9_-]{1,80}$/.test(u.id||'')&&['owner','barber'].includes(u.role)&&u.displayName&&u.email;
 async function config(){return response(200,{mode:'sandbox',ready:!missing().length,missing:missing(),webhookConfigured:!!env.STRIPE_CONNECT_WEBHOOK_SECRET,publishableKey:/^pk_test_/.test(env.STRIPE_CONNECT_PUBLISHABLE_KEY||'')?env.STRIPE_CONNECT_PUBLISHABLE_KEY:null,feeBps:25});}
 return async function(req){
  if(!req.path?.startsWith('/api/connect/'))return null;
  try{
   if(req.path==='/api/connect/config'&&req.method==='GET')return config();
   if(missing().length)return response(503,{error:'Sandbox Connect setup is incomplete.',missing:missing()});
   if(req.path==='/api/connect/webhook'&&req.method==='POST'){
    if(!env.STRIPE_CONNECT_WEBHOOK_SECRET)return response(503,{error:'Connect webhook is not configured.'});
    let event;try{event=(await stripe()).webhooks.constructEvent(req.body,req.headers?.['stripe-signature'],env.STRIPE_CONNECT_WEBHOOK_SECRET);}catch{return response(400,{error:'Invalid webhook signature.'});}
    if(event.livemode!==false)return response(400,{error:'Only sandbox events are accepted.'});
    if(!['account.updated','account.application.deauthorized','payout.created','payout.updated','payout.paid','payout.failed','payout.canceled','balance.available'].includes(event.type))return response(200,{received:true,ignored:true});
    if(!event.account)return response(400,{error:'Expected an event from a connected account.'});
    await store.command(['SET',PREFIX+'event:'+event.id,JSON.stringify({id:event.id,account:event.account,type:event.type,at:clock()}),'EX',604800,'NX']);
    return response(200,{received:true});
   }
   if(req.method==='POST'&&req.headers?.origin!==new URL(env.PUBLIC_ORIGIN).origin)return response(403,{error:'Request origin is not allowed.'});
   if(req.path==='/api/connect/login'&&req.method==='POST'){
    const key=createHash('sha256').update(req.ip||'unknown').digest('hex');if(!await store.rateLimit('connect-login:'+key,10,300))return response(429,{error:'Too many attempts. Try again in five minutes.'});
    const input=json(req.body?.toString()),username=String(input.username||'').trim().toLowerCase(),password=String(input.password||'');if(password.length>256)return response(401,{error:'Invalid sandbox credentials.'});const u=users[username];
    // Equal-cost password hashing for unknown usernames as well.
    const encoded=u?.passwordHash||`scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
    if(!verifyPassword(password,encoded)||!validUser(u))return response(401,{error:'Invalid sandbox credentials.'});
    const payload=Buffer.from(JSON.stringify({username,exp:clock()+28800000,version:createHash('sha256').update(u.passwordHash).digest('hex')})).toString('base64url');
    return response(200,{signedIn:true},{'Set-Cookie':cookie(payload+'.'+sign(payload))});
   }
   if(req.path==='/api/connect/logout'&&req.method==='POST')return response(200,{signedIn:false},{'Set-Cookie':cookie('',0)});
   const u=userFor(req);if(!validUser(u))return response(401,{error:'Sign in to your sandbox payout account.'});
   let account=await accountFor(u);
   if(req.path==='/api/connect/me'&&req.method==='GET')return response(200,{id:u.id,role:u.role,displayName:u.displayName,accountId:account||null,mode:'sandbox'});
   if(req.method==='POST'&&!await store.rateLimit('connect-actions:'+u.id,30,60))return response(429,{error:'Please wait before trying again.'});
   if(req.path==='/api/connect/account'&&req.method==='POST'){
    if(!account){const a=await(await stripe()).v2.core.accounts.create({display_name:u.displayName,contact_email:u.email,dashboard:'full',identity:{country:'us'},configuration:{merchant:{capabilities:{card_payments:{requested:true}}}},defaults:{currency:'usd',responsibilities:{fees_collector:'stripe',losses_collector:'stripe'}},metadata:{platform_user_id:u.id,platform_role:u.role,environment:'sandbox'},include:['configuration.merchant','requirements']},{idempotencyKey:'hf-connect-sandbox-'+u.id});
     if(a.livemode===true)throw Error('Live account rejected');await store.command(['SET',accountKey(u),a.id,'NX']);account=await accountFor(u);
    }
    return response(200,{accountId:account});
   }
   if(!account)return response(409,{error:'Create your sandbox connected account first.'});
   if(req.path==='/api/connect/session'&&req.method==='POST'){
    // The account is selected exclusively from the signed-in server-side user mapping.
    const session=await(await stripe()).accountSessions.create({account,components:{account_onboarding:{enabled:true},notification_banner:{enabled:true},account_management:{enabled:true},payments:{enabled:true,features:{refund_management:true,dispute_management:true}},payouts:{enabled:true,features:{instant_payouts:true,standard_payouts:true,external_account_collection:true,edit_payout_schedule:true}}}});
    if(session.livemode===true)throw Error('Live session rejected');return response(200,{clientSecret:session.client_secret});
   }
   if(req.path==='/api/connect/status'&&req.method==='GET'){
    const client=await stripe(),a=await client.accounts.retrieve(account),balance=await client.balance.retrieve({},{stripeAccount:account}),payouts=await client.payouts.list({limit:5},{stripeAccount:account});
    return response(200,{accountId:account,chargesEnabled:a.charges_enabled,payoutsEnabled:a.payouts_enabled,requirementsDue:a.requirements?.currently_due||[],available:balance.available.map(x=>({amount:x.amount,currency:x.currency})),pending:balance.pending.map(x=>({amount:x.amount,currency:x.currency})),instantAvailable:(balance.instant_available||[]).map(x=>({amount:x.amount,currency:x.currency})),payouts:payouts.data.map(p=>({id:p.id,amount:p.amount,currency:p.currency,status:p.status,method:p.method,arrivalDate:p.arrival_date})),updatedAt:clock(),mode:'sandbox'});
   }
   return response(404,{error:'Not found.'});
  }catch(e){const code=e?.code;return response(503,{error:code==='account_invalid'?'This connected account is unavailable in the platform sandbox. Check the account mapping.':'Stripe sandbox is temporarily unavailable. Check the platform keys, permissions and account setup.',code:code||'connect_unavailable'});}
 };
}
