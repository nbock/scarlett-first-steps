export const SITE_URL = 'https://nbock.github.io/scarlett-first-steps/';
export const ON_PAGES = typeof window !== 'undefined' && window.location.origin === new URL(SITE_URL).origin;
export const HOME = ON_PAGES ? '/scarlett-first-steps/' : '/';
export const ASSETS = '/scarlett-first-steps/';
let cached = {url:'',time:0};
export async function backendOrigin() {
 if (!ON_PAGES) return window.location.origin;
 if (cached.url && Date.now()-cached.time<15000) return cached.url;
 // The raw configuration changes immediately when the Ryzen tunnel restarts.
 const response=await fetch('https://raw.githubusercontent.com/nbock/scarlett-first-steps/runtime/backend.json?t='+Date.now(),{cache:'no-store'});
 if(!response.ok)throw new Error('The birthday server is reconnecting. Please try again shortly.');
 const config=await response.json();
 const url=new URL(config.url);
 if(url.protocol!=='https:' || !(/\.trycloudflare\.com$|\.ngrok-free\.(app|dev)$|\.ngrok\.(app|dev)$/.test(url.hostname)))throw new Error('The birthday server is not connected yet.');
 cached={url:url.origin,time:Date.now()};return cached.url;
}
export async function apiFetch(path:string,options:RequestInit={}){
 const origin=await backendOrigin();
 try{return await fetch(origin+path,{...options,credentials:ON_PAGES?'omit':'same-origin',signal:AbortSignal.timeout(20000)});}
 catch{cached={url:'',time:0};throw new Error('The Ryzen server is reconnecting. Please try again shortly.');}
}
