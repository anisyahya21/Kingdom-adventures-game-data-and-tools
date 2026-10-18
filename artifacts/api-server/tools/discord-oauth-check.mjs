import assert from 'node:assert/strict';
import {discordOAuthJson} from '../src/lib/discord-oauth.ts';
const originalFetch=globalThis.fetch,originalWarn=console.warn;const warnings=[];const calls=[];console.warn=(...args)=>warnings.push(args);let reply;
globalThis.fetch=async(url,init)=>{calls.push({url,init});return reply;};
try{
 reply=new Response(JSON.stringify({access_token:'test-token'}),{headers:{'content-type':'application/json'}});
 const token=await discordOAuthJson('/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'code=test-code'});
 assert.equal(token.access_token,'test-token');assert.equal(calls[0].url,'https://discord.com/api/v10/oauth2/token');assert.equal(calls[0].init.headers.get('accept'),'application/json');assert.ok(calls[0].init.headers.get('user-agent').includes('KingdomAdventurers'));assert.equal(calls[0].init.body,'code=test-code');
 reply=new Response(JSON.stringify({id:'12345'}),{headers:{'content-type':'application/json'}});
 assert.equal((await discordOAuthJson('/users/@me',{headers:{Authorization:'Bearer test-token'}})).id,'12345');assert.equal(calls[1].init.headers.get('authorization'),'Bearer test-token');
 for(const [status,body,contentType,expected] of [[403,'<!doctype html>secret-token','text/html',/HTTP 403/],[200,'<!doctype html>secret-token','text/html',/HTTP 200/],[401,'{"error":"invalid_client"}','application/json',/HTTP 401/],[429,'{"error":"rate limit"}','application/json',/wait a minute/],[200,'{broken-token','application/json',/unreadable/]]){
  reply=new Response(body,{status,headers:{'content-type':contentType}});const count=calls.length;await assert.rejects(discordOAuthJson('/oauth2/token',{method:'POST'}),expected);assert.equal(calls.length,count+1,'No automatic code exchange retries');
 }
 assert.ok(!JSON.stringify(warnings).includes('secret-token'));assert.ok(!JSON.stringify(warnings).includes('broken-token'));
 originalWarn(JSON.stringify({ok:true,providerResponses:7,versionedEndpoint:true,htmlHandled:true,malformedJsonHandled:true,rateLimitHandled:true,sensitiveBodiesExcluded:true,noExchangeRetries:true}));
}finally{globalThis.fetch=originalFetch;console.warn=originalWarn;}