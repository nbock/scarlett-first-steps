import {spawn,execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
const runtime='/home/nbock/.local/share/scarlett-jackpot';mkdirSync(runtime,{recursive:true,mode:0o700});
let publicUrl='',publishing=false,published=false;
async function publish(){
 if(!publicUrl||publishing||published)return;publishing=true;
 try{
  const health=await fetch(publicUrl+'/health',{signal:AbortSignal.timeout(12000)});if(!health.ok)throw new Error('Public tunnel is not ready yet');
  const config=JSON.stringify({url:publicUrl,updated_at:new Date().toISOString()})+'\n';
  let sha;try{sha=JSON.parse(execFileSync('/usr/bin/gh',['api','repos/nbock/scarlett-first-steps/contents/backend.json?ref=runtime'],{encoding:'utf8',stdio:['pipe','pipe','pipe']})).sha;}catch{}
  const payload={message:'Update active Ryzen tunnel',branch:'runtime',content:Buffer.from(config).toString('base64'),...(sha?{sha}:{})};
  execFileSync('/usr/bin/gh',['api','--method','PUT','repos/nbock/scarlett-first-steps/contents/backend.json','--input','-'],{input:JSON.stringify(payload),stdio:['pipe','pipe','pipe'],timeout:30000});
  writeFileSync(runtime+'/tunnel.json',config,{mode:0o600});published=true;console.log('Public URL ready: '+publicUrl);console.log('GitHub Pages now points to this Ryzen tunnel.');
 }catch(e){console.error('Waiting to publish tunnel:',e.message.split('\n')[0]);}finally{publishing=false;}
}
const child=spawn('/home/nbock/apps/.tooling/cloudflared',['tunnel','--no-autoupdate','--url','http://127.0.0.1:8787','--protocol','http2'],{stdio:['ignore','pipe','pipe']});
let accumulated='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{const text=chunk.toString();process.stdout.write(text);accumulated=(accumulated+text).slice(-10000);const match=accumulated.match(/https:\/\/([a-z0-9]+-)+[a-z0-9]+\.trycloudflare\.com/);if(match&&!publicUrl){publicUrl=match[0];publish();}});
const timer=setInterval(publish,15000);
child.on('exit',code=>{clearInterval(timer);process.exit(code||1);});
process.on('SIGTERM',()=>child.kill('SIGTERM'));process.on('SIGINT',()=>child.kill('SIGTERM'));
