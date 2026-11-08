import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp,PAGES} from '../server/server.mjs';
import {settleBets} from '../server/game.ts';
test('Ryzen API: persisted wagers, host login, closure and settlement',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'scarlett-test-'));const dbPath=join(dir,'test.sqlite');const app=createApp({dbPath,password:'test-only-long-password',ready:true});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.server.address().port;
 const request=(path,data,headers={})=>fetch(origin+path,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:data?JSON.stringify(data):undefined});
 try{
  assert.equal((await request('/host')).status,200);
  const first=await request('/api/predictions',{name:'Sam',date:'2026-11-04',amount:25},{Origin:PAGES});assert.equal(first.status,200);assert.equal(first.headers.get('access-control-allow-origin'),PAGES);
  assert.equal((await request('/api/predictions',{name:' sam ',date:'2026-11-04',amount:25})).status,409);
  assert.equal((await request('/api/predictions',{name:'Bad',date:'2026-02-30',amount:25})).status,400);
  assert.equal((await request('/api/predictions',{name:'Bad',date:'2026-11-04',amount:-1})).status,400);
  assert.equal((await request('/api/predictions',{name:'Bad',date:'2026-11-04',amount:10},{Origin:'https://unrelated.example'})).status,403);
  await request('/api/predictions',{name:'Alex',date:'2026-11-07',amount:50});
  assert.equal((await(await request('/api/predictions')).json()).jackpot,75);
  assert.equal((await request('/api/host',{action:'close'},{'oai-authenticated-user-email':'bocknolan@gmail.com','oai-authenticated-user-id':'forged'})).status,403);
  assert.equal((await request('/api/session',{password:'wrong'})).status,401);
  const login=await request('/api/session',{password:'test-only-long-password'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await(await request('/api/session',null,{Cookie:cookie})).json()).authenticated,true);
  assert.equal((await request('/api/host',{action:'close'},{Cookie:cookie,Origin:PAGES})).status,403);
  assert.equal((await request('/api/host',{action:'close'},{Cookie:cookie})).status,200);
  assert.equal((await request('/api/predictions',{name:'Late',date:'2026-11-04',amount:10})).status,409);
  assert.equal((await request('/api/host',{action:'settle',date:'2026-11-05'},{Cookie:cookie})).status,200);
  const board=await(await request('/api/predictions')).json();assert.equal(board.winningDate,'2026-11-04');assert.equal(board.payouts[board.bets.find(b=>b.name==='Sam').id],75);
  assert.equal((await request('/api/host',{action:'settle',date:'2026-11-06'},{Cookie:cookie})).status,409);
 }finally{await new Promise(resolve=>app.server.close(resolve));app.db.close();}
 const reopened=createApp({dbPath,password:'test-only-long-password'});assert.equal(reopened.board().jackpot,75);assert.equal(reopened.board().status,'settled');reopened.db.close();rmSync(dir,{recursive:true,force:true});
});
test('ties split all chips and too-late predictions refund',()=>{
 const bets=[{id:'a',name:'a',date:'2026-11-04',amount:10,created_at:1},{id:'b',name:'b',date:'2026-11-04',amount:30,created_at:2},{id:'c',name:'c',date:'2026-11-07',amount:10,created_at:3}];
 assert.deepEqual(settleBets(bets,'2026-11-05').payouts,{a:13,b:37});assert.equal(settleBets(bets,'2026-11-01').refunded,true);
});
