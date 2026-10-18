import assert from 'node:assert/strict';
import {discordOAuthJson,discordClientAuthorization,discordRetryAfterSeconds,DiscordOAuthRateLimitError} from '../src/lib/discord-oauth.ts';
import {verifyDiscordOAuthReadiness,discordOAuthReadiness} from '../src/lib/discord-oauth-readiness.ts';
const originalFetch=globalThis.fetch,originalWarn=console.warn,originalInfo=console.info,originalNow=Date.now;
const warnings=[],calls=[];let reply,now=originalNow();console.warn=(...args)=>warnings.push(args);console.info=(...args)=>warnings.push(args);Date.now=()=>now;
globalThis.fetch=async(url,init)=>{calls.push({url,init});return typeof reply==='function'?reply(url,init):reply;};
try{
 process.env.DISCORD_CLIENT_ID='test-client';process.env.DISCORD_CLIENT_SECRET='private-test-secret';
 assert.equal(discordClientAuthorization(),'Basic '+Buffer.from('test-client:private-test-secret').toString('base64'));
 reply=new Response(JSON.stringify({access_token:'test-token'}),{headers:{'content-type':'application/json'}});
 const token=await discordOAuthJson('/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:discordClientAuthorization()},body:'code=test-code'});
 assert.equal(token.access_token,'test-token');assert.equal(calls[0].url,'https://discord.com/api/v10/oauth2/token');assert.equal(calls[0].init.headers.get('accept'),'application/json');assert.ok(calls[0].init.headers.get('user-agent').includes('KingdomAdventurers'));assert.equal(calls[0].init.body,'code=test-code');
 reply=new Response(JSON.stringify({id:'12345'}),{headers:{'content-type':'application/json'}});assert.equal((await discordOAuthJson('/users/@me',{headers:{Authorization:'Bearer test-token'}})).id,'12345');
 for(const [status,body,contentType,expected] of [[403,'<!doctype html>secret-token','text/html',/HTTP 403/],[200,'<!doctype html>secret-token','text/html',/HTTP 200/],[401,'{"error":"invalid_client"}','application/json',/HTTP 401/],[200,'{broken-token','application/json',/unreadable/]]){
  reply=new Response(body,{status,headers:{'content-type':contentType}});const count=calls.length;await assert.rejects(discordOAuthJson('/oauth2/token',{method:'POST'}),expected);assert.equal(calls.length,count+1);
 }
 reply=new Response('{"retry_after":2,"global":true}',{status:429,headers:{'content-type':'application/json'}});await assert.rejects(discordOAuthJson('/oauth2/token',{method:'POST'}),e=>e instanceof DiscordOAuthRateLimitError&&e.retryAfterSeconds===2);
 assert.equal(discordRetryAfterSeconds(),2);const count=calls.length;await assert.rejects(discordOAuthJson('/users/@me',{}),DiscordOAuthRateLimitError);assert.equal(calls.length,count,'Cooldown prevents outbound requests');now+=3000;
 reply=(url)=>new Response(JSON.stringify(url.endsWith('/oauth2/token')?{access_token:'owner-test-token'}:url.endsWith('/users/@me')?{id:'12345'}:{}),{headers:{'content-type':'application/json'}});
 await verifyDiscordOAuthReadiness(false);assert.equal(discordOAuthReadiness().credentialsAndIdentityVerified,true);assert.ok(calls.at(-1).url.endsWith('/oauth2/token/revoke'));assert.equal(new URLSearchParams(calls.at(-3).init.body).get('grant_type'),'client_credentials');
 assert.ok(!JSON.stringify(warnings).includes('private-test-secret'));assert.ok(!JSON.stringify(warnings).includes('owner-test-token'));assert.ok(!JSON.stringify(warnings).includes('secret-token'));
 originalInfo(JSON.stringify({ok:true,basicAuthentication:true,htmlAndJsonErrorsHandled:true,realCooldownRespected:true,requestsBlockedDuringCooldown:true,ownerReadinessAndTokenCleanup:true,sensitiveBodiesExcluded:true}));
}finally{globalThis.fetch=originalFetch;console.warn=originalWarn;console.info=originalInfo;Date.now=originalNow;}