import { MODEL } from './engine.mjs';
const cfg=window.APP_CONFIG||{};
let session=JSON.parse(localStorage.getItem('bb-auth')||'null');
const recoveryParams=new URLSearchParams(location.hash.slice(1));
let recoveryPending=sessionStorage.getItem('bb-password-recovery')==='1';
let recoveryError='';
if(recoveryParams.get('type')==='recovery'||recoveryParams.has('error')){
 recoveryPending=true;
 if(recoveryParams.get('type')==='recovery'&&recoveryParams.get('access_token')){
  const expiresIn=Number(recoveryParams.get('expires_in'))||3600;
  session={access_token:recoveryParams.get('access_token'),refresh_token:recoveryParams.get('refresh_token'),token_type:recoveryParams.get('token_type')||'bearer',expires_at:Number(recoveryParams.get('expires_at'))||Math.floor(Date.now()/1000)+expiresIn};
  localStorage.setItem('bb-auth',JSON.stringify(session));
  sessionStorage.setItem('bb-password-recovery','1');
 }else if(recoveryParams.has('error')){
  recoveryError=recoveryParams.get('error_description')||'Este link de recuperação é inválido ou expirou. Solicite um novo e-mail.';
 }
 history.replaceState(null,'',location.pathname+location.search);
}
async function checked(r){const j=await r.json();if(!r.ok)throw Error(j.error_description||j.message||j.error||'Não foi possível salvar. Tente novamente.');return j;}
async function refresh(){if(!session||!cfg.supabaseUrl)return;if(session.expires_at*1000>Date.now()+60000)return;session=await checked(await fetch(cfg.supabaseUrl+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:cfg.anonKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})}));localStorage.setItem('bb-auth',JSON.stringify(session));}
async function rpc(name,args={}){await refresh();return checked(await fetch(cfg.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:cfg.anonKey,Authorization:'Bearer '+session?.access_token,'Content-Type':'application/json'},body:JSON.stringify(args)}));}
export const online=!!cfg.supabaseUrl;
export const loggedIn=()=>!online||!!session;
export const isPasswordRecovery=()=>recoveryPending;
export const passwordRecoveryError=()=>recoveryError;
export async function login(email,password){session=await checked(await fetch(cfg.supabaseUrl+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:cfg.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email,password})}));localStorage.setItem('bb-auth',JSON.stringify(session));}
export async function requestPasswordReset(email){if(!online)throw Error('A recuperação de senha está disponível somente na publicação online.');const redirect=new URL('/',location.origin).toString();return checked(await fetch(cfg.supabaseUrl+'/auth/v1/recover?redirect_to='+encodeURIComponent(redirect),{method:'POST',headers:{apikey:cfg.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email})}));}
export async function updatePassword(password){if(!session?.access_token)throw Error('O link de recuperação é inválido ou expirou. Solicite um novo e-mail.');await refresh();await checked(await fetch(cfg.supabaseUrl+'/auth/v1/user',{method:'PUT',headers:{apikey:cfg.anonKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({password})}));session=null;recoveryPending=false;recoveryError='';localStorage.removeItem('bb-auth');sessionStorage.removeItem('bb-password-recovery');}
export function logout(){session=null;recoveryPending=false;localStorage.removeItem('bb-auth');sessionStorage.removeItem('bb-password-recovery');location.reload();}
export async function getData(){return online?rpc('bb_bootstrap'):checked(await fetch('/api/bootstrap'));}
export async function send(event){return online?rpc('bb_event',{event_input:event}):checked(await fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json','X-BB-App':'1'},body:JSON.stringify(event)}));}
export async function documentUrl(doc,page=1){if(!online)return '/files/'+doc.caminho_storage+'#page='+page;await refresh();const j=await checked(await fetch(cfg.supabaseUrl+'/storage/v1/object/sign/bb-content/'+doc.caminho_storage,{method:'POST',headers:{apikey:cfg.anonKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:3600})}));return cfg.supabaseUrl+'/storage/v1'+j.signedURL+'#page='+page;}
export async function exportData(){const backup=online?await rpc('bb_export'):await checked(await fetch('/api/export'));return {...backup,model:MODEL};}
export async function restore(data){return online?rpc('bb_restore',{backup:data}):checked(await fetch('/api/restore',{method:'POST',headers:{'Content-Type':'application/json','X-BB-App':'1'},body:JSON.stringify(data)}));}
