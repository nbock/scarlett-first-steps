import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp,PAGES} from '../server/server.mjs';
import {settleBets,dollarsToCents,formatMoney} from '../server/game.ts';
import {DatabaseSync} from 'node:sqlite';
test('USD API: exact cents persist across restart; host login, closure and settlement',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'scarlett-test-'));const dbPath=join(dir,'test.sqlite');const app=createApp({dbPath,password:'test-only-long-password',ready:true});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+app.server.address().port;
 const request=(path,data,headers={})=>fetch(origin+path,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:data?JSON.stringify(data):undefined});
 try{
  assert.equal((await request('/host')).status,200);
  assert.equal((await request('/api/predictions',{name:'Old UI',date:'2026-11-04',amount:25})).status,409);
  for(const invalid of [{amountCents:123.4,currency:'USD'},{amountCents:100001,currency:'USD'},{amountCents:2500,currency:'EUR'},{amount:25}]){
   assert.equal((await request('/api/v2/predictions',{name:'Invalid',date:'2026-11-04',...invalid})).status,400);
  }
  const first=await request('/api/v2/predictions',{name:'Sam',date:'2026-11-04',amountCents:2510,currency:"USD"},{Origin:PAGES});assert.equal(first.status,200);assert.equal(first.headers.get('access-control-allow-origin'),PAGES);
  assert.equal((await request('/api/v2/predictions',{name:' sam ',date:'2026-11-04',amountCents:2510,currency:"USD"})).status,409);
  assert.equal((await request('/api/v2/predictions',{name:'Bad',date:'2026-02-30',amountCents:2510,currency:"USD"})).status,400);
  assert.equal((await request('/api/v2/predictions',{name:'Bad',date:'2026-11-04',amountCents:-1,currency:"USD"})).status,400);
  assert.equal((await request('/api/v2/predictions',{name:'Bad',date:'2026-11-04',amountCents:1000,currency:"USD"},{Origin:'https://unrelated.example'})).status,403);
  await request('/api/v2/predictions',{name:'Alex',date:'2026-11-07',amountCents:5055,currency:"USD"});
  assert.equal((await(await request('/api/v2/predictions')).json()).jackpotCents,7565);
  assert.equal((await request('/api/v2/host',{action:'close'},{'oai-authenticated-user-email':'bocknolan@gmail.com','oai-authenticated-user-id':'forged'})).status,403);
  assert.equal((await request('/api/session',{password:'wrong'})).status,401);
  const login=await request('/api/session',{password:'test-only-long-password'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await(await request('/api/session',null,{Cookie:cookie})).json()).authenticated,true);
  assert.equal((await request('/api/v2/host',{action:'close'},{Cookie:cookie,Origin:PAGES})).status,403);
  assert.equal((await request('/api/v2/host',{action:'close'},{Cookie:cookie})).status,200);
  assert.equal((await request('/api/v2/predictions',{name:'Late',date:'2026-11-04',amountCents:1000,currency:"USD"})).status,409);
  assert.equal((await request('/api/v2/host',{action:'settle',date:'2026-11-05'},{Cookie:cookie})).status,200);
  const board=await(await request('/api/v2/predictions')).json();assert.equal(board.winningDate,'2026-11-04');assert.equal(board.payoutsCents[board.bets.find(b=>b.name==='Sam').id],7565);
  assert.equal((await request('/api/v2/host',{action:'settle',date:'2026-11-06'},{Cookie:cookie})).status,409);
 }finally{await new Promise(resolve=>app.server.close(resolve));app.db.close();}
 const reopened=createApp({dbPath,password:'test-only-long-password'});assert.equal(reopened.board().jackpotCents,7565);assert.equal(reopened.board().status,'settled');reopened.db.close();rmSync(dir,{recursive:true,force:true});
});
test('tied payouts preserve every cent and too-late guesses get refund amounts',()=>{
 const bets=[{id:'a',name:'a',date:'2026-11-04',amount_cents:1000,created_at:1},{id:'b',name:'b',date:'2026-11-04',amount_cents:3000,created_at:2},{id:'c',name:'c',date:'2026-11-07',amount_cents:1001,created_at:3}];
 const result=settleBets(bets,'2026-11-05');
 assert.deepEqual(result.payoutsCents,{b:3751,a:1250});
 assert.equal(Object.values(result.payoutsCents).reduce((a,b)=>a+b,0),5001);
 assert.deepEqual(settleBets(bets,'2026-11-01').payoutsCents,{a:1000,b:3000,c:1001});
 assert.equal(settleBets(bets,'2026-11-01').refunded,true);
});
test('dollar input converts to exact cents and rejects fractional cents',()=>{
 for(const [input,expected] of [['1',100],['1.1',110],['10.29',1029],['1000.00',100000]])assert.equal(dollarsToCents(input),expected);
 for(const input of ['', '-1','0.99','1000.01','1.001','1e2','Infinity',' 25'])assert.equal(dollarsToCents(input),null);
 assert.equal(formatMoney(2510),'$25.10');assert.equal(formatMoney(0),'$0.00');
});
test('migration archives chip guesses without turning them into cash bets',()=>{
 const dir=mkdtempSync(join(tmpdir(),'scarlett-migration-'));const dbPath=join(dir,'old.sqlite');
 const old=new DatabaseSync(dbPath);old.exec("CREATE TABLE bets(id TEXT PRIMARY KEY,name TEXT,name_key TEXT UNIQUE,date TEXT,amount INTEGER,created_at INTEGER);CREATE TABLE game(id INTEGER PRIMARY KEY,status TEXT,actual_date TEXT,updated_at INTEGER);");
 old.prepare('INSERT INTO bets VALUES(?,?,?,?,?,?)').run('old','Chip Guest','chip guest','2026-11-04',25,1);old.prepare('INSERT INTO game VALUES(1,?,?,?)').run('settled','2026-11-04',1);old.close();
 const app=createApp({dbPath,password:'test-only',ready:true});assert.equal(app.board().currency,'USD');assert.equal(app.board().jackpotCents,0);assert.equal(app.board().status,'open');assert.equal(app.db.prepare('SELECT amount FROM legacy_chip_bets').get().amount,25);app.db.close();
 const second=createApp({dbPath,password:'test-only'});assert.equal(second.board().bets.length,0);assert.equal(second.db.prepare('SELECT COUNT(*) AS n FROM legacy_chip_bets').get().n,1);second.db.close();rmSync(dir,{recursive:true,force:true});
});
