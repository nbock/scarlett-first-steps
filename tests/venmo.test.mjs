import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {createApp,PAGES} from '../server/server.mjs';
import {normalizeVenmo,venmoProfileUrl} from '../server/venmo.ts';

test('Venmo normalizes usernames and profile links without accepting unrelated URLs',()=>{
 for(const value of [undefined,null,'','   '])assert.equal(normalizeVenmo(value),'');
 for(const value of ['Auntie-Sam',' @Auntie-Sam ','https://venmo.com/u/Auntie-Sam?utm_source=share','venmo.com/Auntie-Sam','https://account.venmo.com/u/Auntie-Sam/','https://www.venmo.com/Auntie-Sam'])assert.equal(normalizeVenmo(value),'Auntie-Sam');
 assert.equal(normalizeVenmo('@auntie_sam'),'auntie_sam');
 for(const value of ['tiny','a'.repeat(31),'bad name','sam@example.com','@@Auntie-Sam','https://example.com/u/Auntie-Sam','https://venmo.com.example.com/u/Auntie-Sam','https://venmo.com@evil.example/u/Auntie-Sam','https://user@venmo.com/u/Auntie-Sam','https://venmo.com:8080/u/Auntie-Sam','https://venmo.com/u/Auntie-Sam/extra','https://venmo.com/u/%2Fbad','https://venmo.com/code?user_id=123456789','javascript:alert(1)',{},123])assert.equal(normalizeVenmo(value),null,String(value));
 assert.equal(venmoProfileUrl('Auntie-Sam'),'https://venmo.com/u/Auntie-Sam');
});

test('Venmo persists with wagers but is available only through the authenticated host API',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'scarlett-venmo-'));const dbPath=join(dir,'test.sqlite');
 const app=createApp({dbPath,password:'test-only',ready:true});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+app.server.address().port;
 const request=(path,data,headers={})=>fetch(origin+path,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:data?JSON.stringify(path==='/api/v3/predictions'?{requestId:randomUUID(),...data}:data):undefined});
 let guestId;
 try{
  const wager={name:'Guest',date:'2026-11-20',amountCents:500,currency:'USD',venmo:'https://venmo.com/u/Auntie-Sam?share=true'};
  assert.equal((await request('/api/v3/predictions',wager,{Origin:PAGES})).status,200);
  for(const venmo of [undefined,null,'','   ','\t\n']){
   const rejected=await request('/api/v3/predictions',{...wager,name:'Missing Venmo',venmo});
   assert.equal(rejected.status,400);assert.match((await rejected.json()).error,/Venmo is required/);
  }
  for(const name of [undefined,null,'','   ']){
   assert.equal((await request('/api/v3/predictions',{...wager,name})).status,400);
  }
  assert.equal(app.board().bets.length,1);assert.equal(app.board().jackpotCents,500);
  assert.equal((await request('/api/v3/predictions',{...wager,name:'Second Guest',venmo:'@Second-Guest'})).status,200);
  assert.equal((await request('/api/v3/predictions',{...wager,name:'Invalid',venmo:'https://evil.example/u/Guest'})).status,400);
  const publicBoard=await(await request('/api/v3/predictions')).json();
  assert.equal(publicBoard.jackpotCents,1000);assert.equal(publicBoard.bets.length,2);
  assert.equal(JSON.stringify(publicBoard).includes('Auntie-Sam'),false);
  assert.equal(Object.hasOwn(publicBoard,'venmoByBet'),false);
  for(const bet of publicBoard.bets)assert.equal(Object.hasOwn(bet,'venmo_username'),false);
  assert.equal((await request('/api/v2/host')).status,403);
  assert.equal((await request('/api/v2/host',null,{'oai-authenticated-user-email':'forged@example.com'})).status,403);
  const login=await request('/api/session',{password:'test-only'});const cookie=login.headers.get('set-cookie').split(';')[0];
  const hostResponse=await fetch(origin+'/api/v2/host',{headers:{Cookie:cookie}});
  assert.equal(hostResponse.status,200);assert.equal(hostResponse.headers.get('cache-control'),'no-store');
  assert.equal(hostResponse.headers.get('access-control-allow-origin'),null);
  const host=await hostResponse.json();guestId=host.bets.find(b=>b.name==='Guest').id;
  assert.equal(host.venmoByBet[guestId],'Auntie-Sam');
  assert.equal(host.venmoByBet[host.bets.find(b=>b.name==='Second Guest').id],'Second-Guest');
  assert.equal((await request('/api/v2/host',null,{Cookie:cookie,Origin:PAGES})).status,403);
  assert.equal((await request('/api/v2/host',null,{Cookie:cookie,Origin:'https://evil.example'})).status,403);
  const publicWithCookie=await(await request('/api/v3/predictions',null,{Cookie:cookie})).json();
  assert.deepEqual(publicWithCookie,publicBoard);
  assert.equal((await fetch(origin+'/api/v2/host',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({action:'close'})})).status,403);
  assert.equal(app.board().status,'open');
 }finally{await new Promise(resolve=>app.server.close(resolve));app.db.close();}
 try{
  const reopened=createApp({dbPath,password:'test-only'});
  try{
   assert.equal(reopened.board().jackpotCents,1000);
   assert.equal(reopened.db.prepare('SELECT venmo_username FROM bets WHERE id=?').get(guestId).venmo_username,'Auntie-Sam');
  }finally{reopened.db.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('Venmo migration retains existing dollar wagers and closed betting across repeated startups',()=>{
 const dir=mkdtempSync(join(tmpdir(),'scarlett-venmo-migration-'));const dbPath=join(dir,'test.sqlite');
 const old=new DatabaseSync(dbPath);
 old.exec("CREATE TABLE bets(id TEXT PRIMARY KEY,name TEXT NOT NULL,name_key TEXT UNIQUE NOT NULL,date TEXT NOT NULL,amount_cents INTEGER NOT NULL,created_at INTEGER NOT NULL);CREATE TABLE game(id INTEGER PRIMARY KEY,status TEXT NOT NULL,actual_date TEXT,updated_at INTEGER NOT NULL);");
 old.prepare('INSERT INTO bets VALUES(?,?,?,?,?,?)').run('existing','Existing Guest','existing guest','2026-11-20',2500,123);
 old.prepare('INSERT INTO game VALUES(1,?,?,?)').run('closed',null,456);old.close();
 try{
  for(let n=0;n<2;n++){
   const app=createApp({dbPath,password:'test-only',ready:true});
   try{
    assert.equal(app.board().status,'closed');assert.equal(app.board().jackpotCents,2500);
    assert.deepEqual({...app.db.prepare('SELECT * FROM bets').get()},{id:'existing',name:'Existing Guest',name_key:'existing guest',date:'2026-11-20',amount_cents:2500,created_at:123,venmo_username:null,request_id:null});
    assert.equal(app.db.prepare('SELECT updated_at FROM game').get().updated_at,456);
    const indexes=app.db.prepare('PRAGMA index_list(bets)').all().filter(index=>index.unique);
    for(const index of indexes)assert.equal(app.db.prepare('SELECT name FROM pragma_index_info(?)').all(index.name).some(column=>column.name==='name_key'),false);
   }finally{app.db.close();}
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
