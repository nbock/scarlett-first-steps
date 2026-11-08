import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {readFileSync,existsSync,mkdirSync,statSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {settleBets,validDate} from './game.ts';
import {initializeDatabase} from './database.mjs';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const PAGES='https://nbock.github.io';
export const SITE=PAGES+'/scarlett-first-steps/';
const hash=s=>createHash('sha256').update(s).digest('hex');
const equal=(a,b)=>timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));

export function createApp({dbPath,password,ready=false,staticRoot=resolve(project,'docs')}){
 mkdirSync(dirname(dbPath),{recursive:true,mode:0o700});
 const db=new DatabaseSync(dbPath);db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 initializeDatabase(db);
 if(ready)db.prepare("INSERT OR IGNORE INTO metadata VALUES('ready','true')").run();
 const failures=new Map();
 const isReady=()=>db.prepare("SELECT value FROM metadata WHERE key='ready'").get()?.value==='true';
 const board=()=>{const bets=db.prepare('SELECT id,name,date,amount_cents,created_at FROM bets ORDER BY created_at DESC,id DESC').all();const game=db.prepare('SELECT status,actual_date FROM game WHERE id=1').get();const actualDate=game?.actual_date||null;return {currency:'USD',bets,jackpotCents:bets.reduce((n,b)=>n+b.amount_cents,0),status:game?.status||'open',actualDate,...settleBets(bets,actualDate)};};
 const session=req=>{const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('scarlett_host='))?.slice(14);return !!token&&!!db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?').get(hash(token),Date.now());};
 async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw new Error('body too long');}return JSON.parse(raw||'{}');}
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');const path=url.pathname.replace(/\/+$/,'')||'/';
  const proto=String(req.headers['x-forwarded-proto']||'http').split(',')[0].trim();
  const origin=proto+'://'+req.headers.host;const from=req.headers.origin;const sameOrigin=from===origin;
  const send=(status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(value));};
  if(['/api/v2/predictions','/api/predictions'].includes(path)&&from===PAGES){res.setHeader('Access-Control-Allow-Origin',PAGES);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');}
  if(req.method==='OPTIONS'){res.writeHead(['/api/v2/predictions','/api/predictions'].includes(path)&&from===PAGES?204:403);return res.end();}
  try{
   if(path==='/health'){return send(200,{ok:true,ready:isReady(),currency:'USD'});}
   if(['/api/predictions','/api/host'].includes(path))return send(409,{error:'Wagers now use US dollars. Refresh the page before placing a bet or recording results.'});
   if(path==='/api/v2/predictions'){
    if(!isReady())return send(503,{error:'The birthday server is finishing setup. Please try again shortly.'});
    if(req.method==='GET')return send(200,board());
    if(req.method!=='POST')return send(405,{error:'Method not allowed.'});
    if(!sameOrigin&&from!==PAGES)return send(403,{error:'Please place bets from the birthday website.'});
    const input=await body(req);const name=typeof input.name==='string'?input.name.normalize('NFKC').trim().replace(/\s+/g,' '):'';
    if(!name||name.length>40||/[\x00-\x1f]/.test(name)||!validDate(input.date)||input.currency!=='USD'||!Number.isSafeInteger(input.amountCents)||input.amountCents<100||input.amountCents>100000)return send(400,{error:'Enter your name, a valid date, and a US-dollar wager from $1.00 to $1,000.00, with at most two decimal places.'});
    try{const result=db.prepare("INSERT INTO bets SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM game WHERE id=1 AND status!='open')").run(randomUUID(),name,name.toLocaleLowerCase('en-US'),input.date,input.amountCents,Date.now());if(!result.changes)return send(409,{error:'Betting is closed. The jackpot is locked.'});return send(200,{saved:true});}
    catch(e){if(/UNIQUE/.test(e.message))return send(409,{error:'A bet already exists under that name. One bet per person; add your last initial if someone shares your name.'});throw e;}
   }
   if(path==='/api/session'){
    if(req.method==='GET')return send(200,{authenticated:session(req)});
    if(!sameOrigin)return send(403,{error:'Sign in from this host page.'});
    const cookie=`scarlett_host=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${proto==='https'?'; Secure':''}`;
    if(req.method==='DELETE'){const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('scarlett_host='))?.slice(14);if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));return send(200,{saved:true},{'Set-Cookie':cookie});}
    if(req.method!=='POST')return send(405,{error:'Method not allowed.'});
    const ip=String(req.headers['cf-connecting-ip']||req.socket.remoteAddress);const attempt=failures.get(ip);if(attempt&&attempt.until>Date.now()&&attempt.count>=10)return send(429,{error:'Too many attempts. Try again in 15 minutes.'});
    const input=await body(req);if(typeof input.password!=='string'||!equal(input.password,password)){const current=attempt&&attempt.until>Date.now()?attempt:{count:0,until:Date.now()+900000};current.count++;failures.set(ip,current);return send(401,{error:'That host password is incorrect.'});}
    failures.delete(ip);db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?)').run(hash(token),Date.now()+43200000);
    return send(200,{authenticated:true},{'Set-Cookie':`scarlett_host=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${proto==='https'?'; Secure':''}`});
   }
   if(path==='/api/v2/host'){
    if(!session(req)||!sameOrigin)return send(403,{error:'Sign in as the host before changing the jackpot.'});
    if(req.method!=='POST')return send(405,{error:'Method not allowed.'});
    if(!isReady())return send(503,{error:'Setup is not complete yet.'});
    const input=await body(req);const status=input.action==='close'?'closed':input.action==='settle'?'settled':null;
    if(!status||(status==='settled'&&(!validDate(input.date)||input.date>new Date().toISOString().slice(0,10))))return send(400,{error:'Enter the actual first-steps date, today or earlier.'});
    const result=db.prepare("INSERT INTO game VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,actual_date=excluded.actual_date,updated_at=excluded.updated_at WHERE game.status!='settled'").run(status,status==='settled'?input.date:null,Date.now());
    return result.changes?send(200,{saved:true}):send(409,{error:'The jackpot has already been settled.'});
   }
   if(path.startsWith('/api/'))return send(404,{error:'Not found.'});
   if(!['GET','HEAD'].includes(req.method))return send(405,{error:'Method not allowed.'});
   let relative=decodeURIComponent(path).replace(/^\/scarlett-first-steps(?=\/|$)/,'').replace(/^\//,'');
   if(['','host','invite','host/','invite/'].includes(relative))relative='index.html';
   const file=resolve(staticRoot,relative);if(!file.startsWith(staticRoot+'/')||!existsSync(file)||!statSync(file).isFile())return send(404,{error:'Not found.'});
   const type={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'}[extname(file)]||'application/octet-stream';
   res.writeHead(200,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':file.includes('/assets/')?'public, max-age=31536000, immutable':'no-store'});res.end(req.method==='HEAD'?undefined:readFileSync(file));
  }catch(e){send(e instanceof SyntaxError?400:500,{error:e instanceof SyntaxError?'Invalid request.':'The request could not be completed. Please try again.'});console.error('Request failed:',req.method,path,e.message);}
 });
 return {server,db,board};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const configPath=process.env.SCARLETT_CONFIG||'/home/nbock/.config/scarlett-jackpot/config.json';
 const config=JSON.parse(readFileSync(configPath,'utf8'));
 const app=createApp({dbPath:config.dbPath,password:config.hostPassword});
 app.server.listen(config.port||8787,'127.0.0.1',()=>console.log('Scarlett server listening on 127.0.0.1:'+(config.port||8787)));
 const shutdown=()=>app.server.close(()=>{app.db.close();process.exit(0);});process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
