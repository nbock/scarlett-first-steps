import {mkdirSync,existsSync,writeFileSync,chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const dir='/home/nbock/.config/scarlett-jackpot';mkdirSync(dir,{recursive:true,mode:0o700});
const file=dir+'/config.json';if(!existsSync(file)){
 const hostPassword=randomBytes(18).toString('base64url');
 writeFileSync(file,JSON.stringify({port:8787,dbPath:'/home/nbock/.local/share/scarlett-jackpot/bets.sqlite',hostPassword},null,2),{mode:0o600});
 writeFileSync(dir+'/host-password.txt',hostPassword+'\n',{mode:0o600});
}chmodSync(file,0o600);console.log('Host configuration is ready. Password is stored privately in '+dir+'/host-password.txt');
