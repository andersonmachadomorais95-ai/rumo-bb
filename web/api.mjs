const cfg=window.APP_CONFIG||{};
let session=JSON.parse(localStorage.getItem('bb-auth')||'null');
async function checked(r){const j=await r.json();if(!r.ok)throw Error(j.error_description||j.message||j.error||'Não foi possível salvar. Tente novamente.');return j;}
async function refresh(){if(!session||!cfg.supabaseUrl)return;if(session.expires_at*1000>Date.now()+60000)return;session=await checked(await fetch(cfg.supabaseUrl+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:cfg.anonKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})}));localStorage.setItem('bb-auth',JSON.stringify(session));}
async function rpc(name,args={}){await refresh();return checked(await fetch(cfg.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:cfg.anonKey,Authorization:'Bearer '+session?.access_token,'Content-Type':'application/json'},body:JSON.stringify(args)}));}
export const online=!!cfg.supabaseUrl;
export const loggedIn=()=>!online||!!session;
export async function login(email,password){session=await checked(await fetch(cfg.supabaseUrl+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:cfg.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email,password})}));localStorage.setItem('bb-auth',JSON.stringify(session));}
export function logout(){session=null;localStorage.removeItem('bb-auth');location.reload();}
export async function getData(){return online?rpc('bb_bootstrap'):checked(await fetch('/api/bootstrap'));}
export async function send(event){return online?rpc('bb_event',{event_input:event}):checked(await fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json','X-BB-App':'1'},body:JSON.stringify(event)}));}
export async function documentUrl(doc,page=1){if(!online)return '/files/'+doc.caminho_storage+'#page='+page;await refresh();const j=await checked(await fetch(cfg.supabaseUrl+'/storage/v1/object/sign/bb-content/'+doc.caminho_storage,{method:'POST',headers:{apikey:cfg.anonKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:3600})}));return cfg.supabaseUrl+'/storage/v1'+j.signedURL+'#page='+page;}
export async function exportData(){return online?rpc('bb_export'):checked(await fetch('/api/export'));}
export async function restore(data){return online?rpc('bb_restore',{backup:data}):checked(await fetch('/api/restore',{method:'POST',headers:{'Content-Type':'application/json','X-BB-App':'1'},body:JSON.stringify(data)}));}
