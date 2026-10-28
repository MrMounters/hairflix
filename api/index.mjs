import {createAccessApp} from '../server/access.mjs';
import {createConnectApp} from '../server/connect.mjs';
import {createBookingApp} from '../server/booking.mjs';
// Do not parse/re-serialize a Stripe webhook: its signature covers exact raw bytes.
export const config={api:{bodyParser:false}};
const app=createBookingApp(process.env),connect=createConnectApp(process.env),access=createAccessApp(process.env);
export default async function handler(req,res){
 const origin=process.env.PUBLIC_ORIGIN??`https://${req.headers.host??'localhost'}`;
 const url=new URL(req.url,origin);
 const routed=url.searchParams.get('path');
 const path=routed?'/api/'+routed.replace(/^\/+|\/+$/g,''):url.pathname;
 let body=Buffer.alloc(0);
 try{
  const chunks=[];let size=0;
  for await(const chunk of req){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=b.length;if(size>(['/api/stripe/webhook','/api/connect/webhook'].includes(path)?1048576:32768)){res.statusCode=413;res.end('Request too large');return;}chunks.push(b);}
  body=Buffer.concat(chunks);
  if(!body.length&&Buffer.isBuffer(req.rawBody))body=req.rawBody;
  if(!body.length&&req.body&&!['/api/stripe/webhook','/api/connect/webhook'].includes(path))body=Buffer.from(typeof req.body==='string'?req.body:JSON.stringify(req.body));
  const request={method:req.method,path,query:Object.fromEntries(url.searchParams),headers:req.headers,body,ip:String(req.headers['x-forwarded-for']??req.socket?.remoteAddress??'unknown').split(',')[0].trim()};
  const response=await access(request)||await connect(request)||await app(request);
  res.writeHead(response.status,response.headers);res.end(response.body);
 }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'The booking service is temporarily unavailable.'}));}
}
