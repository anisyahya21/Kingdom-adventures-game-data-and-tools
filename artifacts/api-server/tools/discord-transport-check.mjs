import assert from 'node:assert/strict';import {createHmac,randomBytes} from 'node:crypto';import handler from '../../kingdom-adventures/api/discord-provider.js';
const secret='fixture-relay-secret';process.env.DISCORD_HTTP_RELAY_SECRET=secret;const originalFetch=globalThis.fetch;let outbound=0,upstreamStatus=200;
globalThis.fetch=async(url,init)=>{outbound++;assert.ok(String(url).startsWith('https://discord.com/api/v10/'));assert.equal(init.headers.Authorization,'Basic fixture');return new Response(upstreamStatus===429?'{"retry_after":7}':'{"access_token":"fixture-token"}',{status:upstreamStatus,headers:{'content-type':'application/json','retry-after':'7'}});};
function signed(input,time=Date.now()){const raw=JSON.stringify(input),timestamp=String(time),nonce=randomBytes(16).toString('hex');return {method:'POST',headers:{'x-ka-discord-time':timestamp,'x-ka-discord-nonce':nonce,'x-ka-discord-signature':createHmac('sha256',secret).update(`${timestamp}.${nonce}.${raw}`).digest('hex')},body:input};}
async function run(req){let status=200,body,headers={};const res={setHeader(k,v){headers[k]=v;},status(s){status=s;return this;},json(v){body=v;return this;},end(v){body=v;return this;}};await handler(req,res);return {status,body,headers};}
try{
 assert.equal((await run({method:'POST',headers:{},body:{}})).status,401);
 const input={path:'/oauth2/token',method:'POST',authorization:'Basic fixture',contentType:'application/x-www-form-urlencoded',body:'code=fixture'};
 assert.equal((await run(signed(input,Date.now()-70000))).status,401);
 const tampered=signed(input);tampered.body={...input,body:'code=tampered'};assert.equal((await run(tampered)).status,401);
 assert.equal((await run(signed({...input,path:'https://example.com'}))).status,400);
 assert.equal((await run(signed({...input,path:'/users/@me',method:'POST'}))).status,400);
 assert.equal(outbound,0);
 const valid=signed(input);const success=await run(valid);assert.equal(success.status,200);assert.equal(success.headers['Cache-Control'],'private, no-store');assert.equal(JSON.parse(success.body).access_token,'fixture-token');assert.equal(outbound,1);
 assert.equal((await run(valid)).status,409);assert.equal(outbound,1);
 upstreamStatus=429;const rate=await run(signed(input));assert.equal(rate.status,429);assert.equal(rate.headers['retry-after'],'7');
 console.log(JSON.stringify({ok:true,signedTransport:true,unauthorizedRejected:true,staleAndTamperedRejected:true,arbitraryDestinationsRejected:true,replayRejected:true,providerResponsePreserved:true,cooldownPreserved:true,externalRequests:0}));
}finally{globalThis.fetch=originalFetch;}