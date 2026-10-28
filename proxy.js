import {next} from '@vercel/functions';
import {accessGate} from './server/access.mjs';
export default function proxy(request){return accessGate(request,process.env)||next({headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});}
