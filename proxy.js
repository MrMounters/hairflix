import {next} from '@vercel/functions';
import {accessGate,accessCacheHeaders} from './server/access.mjs';
export default function proxy(request){return accessGate(request,process.env)||next({headers:accessCacheHeaders(new URL(request.url).pathname)});}
