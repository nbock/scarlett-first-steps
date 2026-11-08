import {readFileSync} from 'node:fs';
import {createApp} from '../server/server.mjs';
import {validDate} from '../server/game.ts';
const config=JSON.parse(readFileSync('/home/nbock/.config/scarlett-jackpot/config.json','utf8'));
const response=await fetch('https://scarlett-first-steps-jackpot.bocknolan.chatgpt.site/api/predictions');if(!response.ok)throw new Error('Could not read the previous site');
const data=await response.json();
if(!Array.isArray(data.bets)||!['open','closed','settled'].includes(data.status))throw new Error('Invalid previous-site data');
const {db}=createApp({dbPath:config.dbPath,password:config.hostPassword});
if(db.prepare("SELECT 1 FROM metadata WHERE key='imported'").get())throw new Error('Import already completed; refusing to overwrite data');
if(db.prepare('SELECT COUNT(*) AS n FROM bets').get().n)throw new Error('Local database is not empty; import requires review');
db.exec('BEGIN IMMEDIATE');try{
 for(const bet of data.bets){if(!validDate(bet.date)||!Number.isInteger(bet.amount)||bet.amount<1||bet.amount>1000)throw new Error('Invalid existing bet');db.prepare('INSERT INTO bets VALUES(?,?,?,?,?,?)').run(bet.id,bet.name,bet.name.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US'),bet.date,bet.amount,bet.created_at);}
 db.prepare('INSERT OR REPLACE INTO game VALUES(1,?,?,?)').run(data.status,data.actualDate||null,Date.now());
 db.prepare("INSERT INTO metadata VALUES('ready','true')").run();db.prepare("INSERT INTO metadata VALUES('imported','true')").run();db.exec('COMMIT');console.log(`Imported ${data.bets.length} bets and ${data.jackpot} chips.`);
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
