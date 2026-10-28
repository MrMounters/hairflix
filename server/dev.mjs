import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {accessGate,createAccessApp} from './access.mjs';
import {createConnectApp} from './connect.mjs';
import {createBookingApp} from './booking.mjs';
import {SqliteStore} from './sqlite-store.mjs';
const port=Number(process.env.PORT??8092),root=resolve('dist');
// Local holds can use SQLite. Payment remains unavailable without Stripe config.
const env={...process.env};
const store=new SqliteStore(process.env.LOCAL_BOOKING_DB??':memory:');
const app=createBookingApp(env,{store}),connect=createConnectApp(env),access=createAccessApp(env);
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.json':'application/json'};
createServer(async(req,res)=>{
 const url=new URL(req.url,`http://127.0.0.1:${port}`);
 const gate=accessGate(new Request(url,{headers:req.headers}),env);if(gate){res.writeHead(gate.status,Object.fromEntries(gate.headers));res.end(await gate.text());return;}
 if(url.pathname.startsWith('/api/')){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const request={method:req.method,path:url.pathname,query:Object.fromEntries(url.searchParams),headers:req.headers,body:Buffer.concat(chunks),ip:req.socket.remoteAddress};
  const response=await access(request)||await connect(request)||await app(request);
  res.writeHead(response.status,response.headers);res.end(response.body);return;
 }
 const path=resolve(root,'.'+(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname));
 if(!path.startsWith(root+'/')){res.writeHead(403);res.end();return;}
 try{const data=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]??'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Hairflix preview http://127.0.0.1:${port}`));
