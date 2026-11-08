export const SITE_URL = 'https://nbock.github.io/scarlett-first-steps/';
export const ON_PAGES = typeof window !== 'undefined' && window.location.origin === new URL(SITE_URL).origin;
export const HOME = ON_PAGES ? '/scarlett-first-steps/' : '/';
export const ASSETS = '/scarlett-first-steps/';
let cached = '';
let pending: Promise<string> | null = null;
let lastFreshLookup = 0;

export async function backendOrigin(fresh = false): Promise<string> {
 if (!ON_PAGES) return window.location.origin;
 if (cached && (!fresh || Date.now() - lastFreshLookup < 60000)) return cached;
 if (pending) return pending;
 pending = (async () => {
  // Raw GitHub files can stay cached after a tunnel restart. Use the API only
  // when that address fails, then retain the working address for this page.
  if (fresh) lastFreshLookup = Date.now();
  const source = fresh
   ? 'https://api.github.com/repos/nbock/scarlett-first-steps/contents/backend.json?ref=runtime'
   : 'https://raw.githubusercontent.com/nbock/scarlett-first-steps/runtime/backend.json';
  const response = await fetch(source, {cache:'no-store',signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('The birthday server is reconnecting. Please try again shortly.');
  const data = await response.json();
  const config = fresh ? JSON.parse(atob(data.content)) : data;
  const url = new URL(config.url);
  if (url.protocol !== 'https:' || !(/\.trycloudflare\.com$|\.ngrok-free\.(app|dev)$|\.ngrok\.(app|dev)$/.test(url.hostname))) throw new Error('The birthday server is not connected yet.');
  cached = url.origin;
  return cached;
 })();
 try { return await pending; } finally { pending = null; }
}

export async function apiFetch(path: string, options: RequestInit = {}) {
 const origin = await backendOrigin();
 const method = (options.method || 'GET').toUpperCase();
 const request = (target: string) => fetch(target + path, {...options,credentials:ON_PAGES?'omit':'same-origin',signal:AbortSignal.timeout(20000)});
 try {
  const response = await request(origin);
  if (response.status < 500) return response;
 } catch { /* Resolve a replacement address below. */ }
 if (ON_PAGES) {
  const replacement = await backendOrigin(true);
  // Never automatically repeat a wager or another write after an uncertain result.
  if (method === 'GET' && replacement !== origin) {
   const response = await request(replacement);
   if (response.status < 500) return response;
  }
 }
 throw new Error(method === 'GET'
  ? 'The Ryzen server is reconnecting. Please try again shortly.'
  : 'The connection was interrupted. Refresh and check the betting board before submitting again.');
}
