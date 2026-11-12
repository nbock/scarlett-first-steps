import test from 'node:test';
import assert from 'node:assert/strict';
const stale='https://old-tunnel.trycloudflare.com',current='https://new-tunnel.trycloudflare.com';
globalThis.window={location:{origin:'https://nbock.github.io'}};
test('cached tunnel addresses recover through GitHub API and the working address is retained',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url)=>{calls.push(url);if(url.includes('raw.githubusercontent.com'))return Response.json({url:stale});if(url.includes('api.github.com'))return Response.json({content:Buffer.from(JSON.stringify({url:current})).toString('base64')});if(url.startsWith(stale))return new Response('Gone',{status:530});return Response.json({currency:'USD'});};
 try{const api=await import('../web/api.ts?read-recovery');assert.equal((await api.apiFetch('/api/v3/predictions')).status,200);assert.equal(await api.backendOrigin(),current);await api.apiFetch('/api/v3/predictions');assert.equal(calls.filter(url=>url.includes('api.github.com')).length,1);assert.equal(calls.filter(url=>url.includes('raw.githubusercontent.com')).length,1);}finally{globalThis.fetch=original;}
});
test('a wager is never replayed automatically when a tunnel fails',async()=>{
 const original=globalThis.fetch;let writes=0;
 globalThis.fetch=async(url,options)=>{if(url.includes('raw.githubusercontent.com'))return Response.json({url:stale});if(url.includes('api.github.com'))return Response.json({content:Buffer.from(JSON.stringify({url:current})).toString('base64')});if(options.method==='POST')writes++;return new Response('Gone',{status:530});};
 try{const api=await import('../web/api.ts?write-recovery');await assert.rejects(api.apiFetch('/api/v3/predictions',{method:'POST',body:'{}'}),/check the betting board/);assert.equal(writes,1);assert.equal(await api.backendOrigin(),current);}finally{globalThis.fetch=original;}
});
