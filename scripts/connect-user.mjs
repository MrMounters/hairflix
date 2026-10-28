import {passwordHash} from '../server/connect.mjs';
import {readFileSync} from 'node:fs';
const [username,id,role,displayName,email,accountId]=process.argv.slice(2);
if(!username||!/^[a-z0-9_-]{1,80}$/.test(id||'')||!['owner','barber'].includes(role)||!displayName||!email){console.error('Usage: node scripts/connect-user.mjs USERNAME ID owner|barber "Display name" EMAIL [acct_existing] < /path/to/password-file');process.exit(1);}
const password=readFileSync(0,'utf8').replace(/\r?\n$/,'');
if(password.length<12||password.length>256){console.error('Provide a unique password of 12–256 characters on stdin.');process.exit(1);}
if(accountId&&!/^acct_[a-zA-Z0-9]+$/.test(accountId)){console.error('Invalid connected account ID.');process.exit(1);}
console.log(JSON.stringify({[username.toLowerCase()]:{id,role,displayName,email,passwordHash:passwordHash(password),...(accountId?{accountId}:{})}},null,2));
