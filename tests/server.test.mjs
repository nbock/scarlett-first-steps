import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp,PAGES} from '../server/server.mjs';
import {ENTRY_FEE_CENTS,settleBets,formatMoney} from '../server/game.ts';
import {DatabaseSync} from 'node:sqlite';
const entry=(overrides={})=>({name:'Sam',date:'2026-11-04',amountCents:ENTRY_FEE_CENTS,currency:'USD',venmo:'sam-test',requestId:randomUUID(),...overrides});

test('$5 entries: repeat names allowed, retries do not duplicate, host closure and equal payout persist',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'scarlett-fixed-'));const dbPath=join(dir,'test.sqlite');
 const app=createApp({dbPath,password:'test-only-long-password',ready:true});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.server.address().port;
 const request=(path,data,headers={})=>fetch(origin+path,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:data?JSON.stringify(data):undefined});
 const firstEntry=entry();
 try{
  assert.equal((await request('/host')).status,200);
  for(const path of ['/api/predictions','/api/v2/predictions'])assert.equal((await request(path,firstEntry)).status,409);
  for(const amountCents of [0,100,499,501,1000,2500,100000,500.1,'500',null]){
   assert.equal((await request('/api/v3/predictions',entry({amountCents}))).status,400);
  }
  for(const invalid of [{currency:'EUR'},{requestId:undefined},{requestId:'invalid'},{date:'2026-02-30'},{name:'   '},{venmo:''}]){
   assert.equal((await request('/api/v3/predictions',entry(invalid))).status,400);
  }
  assert.equal(app.board().bets.length,0);
  assert.equal((await request('/api/v3/predictions',firstEntry,{Origin:'https://unrelated.example'})).status,403);
  const first=await request('/api/v3/predictions',firstEntry,{Origin:PAGES});assert.equal(first.status,200);assert.equal(first.headers.get('access-control-allow-origin'),PAGES);
  const firstSaved=await first.json();
  const retries=await Promise.all([request('/api/v3/predictions',firstEntry),request('/api/v3/predictions',firstEntry)]);
  for(const retry of retries){assert.equal(retry.status,200);assert.deepEqual(await retry.json(),firstSaved);}
  assert.equal(app.board().bets.length,1);assert.equal(app.board().jackpotCents,500);
  assert.equal((await request('/api/v3/predictions',{...firstEntry,date:'2026-11-05'})).status,409);
  assert.equal((await request('/api/v3/predictions',entry({name:' sam '}))).status,200);
  assert.equal((await request('/api/v3/predictions',entry({name:'Alex',date:'2026-11-07',venmo:'alex-test'}))).status,200);
  assert.equal(app.board().bets.length,3);assert.equal(app.board().jackpotCents,1500);assert.equal(app.board().entryFeeCents,500);
  assert.equal((await(await request('/api/v2/predictions')).json()).jackpotCents,1500);
  assert.equal((await request('/api/v2/host',{action:'close'},{'oai-authenticated-user-email':'forged@example.com'})).status,403);
  assert.equal((await request('/api/v2/host',{action:'set-venmo',venmo:'evil-guest'})).status,403);
  assert.equal((await request('/api/session',{password:'wrong'})).status,401);
  const login=await request('/api/session',{password:'test-only-long-password'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/v2/host',{action:'set-venmo',venmo:'https://evil.example/host'},{Cookie:cookie})).status,400);
  assert.equal((await request('/api/v2/host',{action:'set-venmo',venmo:'@host-test'},{Cookie:cookie,Origin:PAGES})).status,403);
  assert.equal((await request('/api/v2/host',{action:'set-venmo',venmo:'https://venmo.com/u/host-test'},{Cookie:cookie})).status,200);
  assert.equal((await(await request('/api/v3/predictions')).json()).hostVenmo,'host-test');
  assert.equal((await request('/api/v2/host',{action:'close'},{Cookie:cookie,Origin:PAGES})).status,403);
  assert.equal((await request('/api/v2/host',{action:'close'},{Cookie:cookie})).status,200);
  assert.equal((await request('/api/v3/predictions',entry({name:'Late'}))).status,409);
  assert.deepEqual(await(await request('/api/v3/predictions',firstEntry)).json(),firstSaved);
  assert.equal(app.board().jackpotCents,1500);
  assert.equal((await request('/api/v2/host',{action:'settle',date:'2026-11-05'},{Cookie:cookie})).status,200);
  const board=app.board();assert.equal(board.winningDate,'2026-11-04');
  for(const bet of board.bets.filter(b=>b.date==='2026-11-04'))assert.equal(board.payoutsCents[bet.id],750);
  assert.equal(Object.values(board.payoutsCents).reduce((a,b)=>a+b,0),1500);
  assert.equal((await request('/api/v2/host',{action:'settle',date:'2026-11-06'},{Cookie:cookie})).status,409);
 }finally{await new Promise(resolve=>app.server.close(resolve));app.db.close();}
 try{
  const reopened=createApp({dbPath,password:'test-only-long-password'});
  try{
   assert.equal(reopened.board().jackpotCents,1500);assert.equal(reopened.board().status,'settled');assert.equal(reopened.board().hostVenmo,'host-test');
   assert.equal(reopened.db.prepare('SELECT COUNT(*) AS n FROM bets WHERE request_id=?').get(firstEntry.requestId).n,1);
  }finally{reopened.db.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('closing betting needs no actual date and preserves future entries without awarding payouts',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'scarlett-close-'));const app=createApp({dbPath:join(dir,'test.sqlite'),password:'test-only',ready:true});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.server.address().port;
 const request=(path,data,headers={})=>fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
 try{
  for(const date of ['2035-11-20','2035-11-22'])assert.equal((await request('/api/v3/predictions',entry({date}))).status,200);
  const before=app.board();
  const login=await request('/api/session',{password:'test-only'});const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/v2/host',{action:'close'},{Cookie:cookie})).status,200);
  const closed=app.board();assert.equal(closed.status,'closed');assert.equal(closed.actualDate,null);assert.equal(closed.winningDate,null);
  assert.deepEqual(closed.payoutsCents,{});assert.equal(closed.jackpotCents,1000);assert.deepEqual(closed.bets,before.bets);
  assert.equal((await request('/api/v2/host',{action:'settle',date:'2035-11-22'},{Cookie:cookie})).status,400);
  assert.deepEqual(app.board(),closed);
  assert.equal((await request('/api/v3/predictions',entry({date:'2035-11-21'}))).status,409);
 }finally{await new Promise(resolve=>app.server.close(resolve));app.db.close();rmSync(dir,{recursive:true,force:true});}
});

test('equal winning-entry shares preserve every cent; exact dates win and late guesses are refunded',()=>{
 const bets=[['a','Sam','2026-11-04'],['b','Sam','2026-11-04'],['c','Alex','2026-11-04'],['d','Pat','2026-11-07']].map(([id,name,date],i)=>({id,name,date,amount_cents:500,created_at:i}));
 const result=settleBets(bets,'2026-11-05');assert.equal(result.winningDate,'2026-11-04');
 assert.deepEqual(result.payoutsCents,{a:667,b:667,c:666});
 assert.equal(Object.values(result.payoutsCents).reduce((a,b)=>a+b,0),2000);
 assert.deepEqual(settleBets(bets,'2026-11-07').payoutsCents,{d:2000});
 const refund=settleBets(bets,'2026-11-01');assert.equal(refund.refunded,true);assert.deepEqual(refund.payoutsCents,{a:500,b:500,c:500,d:500});
 assert.deepEqual(settleBets(bets,null),{winningDate:null,payoutsCents:{},refunded:false});
 assert.equal(formatMoney(ENTRY_FEE_CENTS),'$5.00');
});

test('migration archives chip guesses without turning them into cash entries',()=>{
 const dir=mkdtempSync(join(tmpdir(),'scarlett-migration-'));const dbPath=join(dir,'old.sqlite');
 const old=new DatabaseSync(dbPath);old.exec("CREATE TABLE bets(id TEXT PRIMARY KEY,name TEXT,name_key TEXT UNIQUE,date TEXT,amount INTEGER,created_at INTEGER);CREATE TABLE game(id INTEGER PRIMARY KEY,status TEXT,actual_date TEXT,updated_at INTEGER);");
 old.prepare('INSERT INTO bets VALUES(?,?,?,?,?,?)').run('old','Chip Guest','chip guest','2026-11-04',25,1);old.prepare('INSERT INTO game VALUES(1,?,?,?)').run('settled','2026-11-04',1);old.close();
 try{
  for(let n=0;n<2;n++){
   const app=createApp({dbPath,password:'test-only',ready:true});
   try{assert.equal(app.board().currency,'USD');assert.equal(app.board().jackpotCents,0);assert.equal(app.board().status,'open');assert.equal(app.db.prepare('SELECT amount FROM legacy_chip_bets').get().amount,25);}
   finally{app.db.close();}
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
