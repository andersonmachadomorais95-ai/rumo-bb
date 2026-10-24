import test from 'node:test';
import assert from 'node:assert/strict';

function storage(){
 const values=new Map();
 return {
  getItem:key=>values.get(key)??null,
  setItem:(key,value)=>values.set(key,String(value)),
  removeItem:key=>values.delete(key)
 };
}

async function loadApi(hash,fetchMock){
 globalThis.window={APP_CONFIG:{supabaseUrl:'https://supabase.test',anonKey:'public-key'}};
 globalThis.localStorage=storage();
 globalThis.sessionStorage=storage();
 globalThis.location={hash,origin:'https://rumo-bb.vercel.app',pathname:'/',search:''};
 let replacedUrl='';
 globalThis.history={replaceState(_state,_title,url){replacedUrl=url;}};
 globalThis.fetch=fetchMock;
 const api=await import(`../web/api.mjs?test=${Math.random()}`);
 return {api,getReplacedUrl:()=>replacedUrl};
}

test('Solicitação de redefinição usa o domínio publicado como redirecionamento',async()=>{
 let request;
 const {api}=await loadApi('',async(url,options)=>{request={url:String(url),options};return {ok:true,json:async()=>({})};});

 await api.requestPasswordReset('aluno@example.com');

 assert.match(request.url,/\/auth\/v1\/recover\?redirect_to=https%3A%2F%2Frumo-bb\.vercel\.app%2F$/);
 assert.equal(request.options.method,'POST');
 assert.deepEqual(JSON.parse(request.options.body),{email:'aluno@example.com'});
});

test('Callback de recuperação atualiza a senha e descarta a sessão temporária',async()=>{
 const calls=[];
 const {api,getReplacedUrl}=await loadApi('#access_token=recovery-token&refresh_token=refresh-token&type=recovery&expires_in=3600',async(url,options)=>{calls.push({url:String(url),options});return {ok:true,json:async()=>({})};});

 assert.equal(api.isPasswordRecovery(),true);
 assert.equal(api.loggedIn(),true);
 assert.equal(getReplacedUrl(),'/');
 await api.updatePassword('new-password');

 assert.equal(calls[0].url,'https://supabase.test/auth/v1/user');
 assert.equal(calls[0].options.method,'PUT');
 assert.equal(calls[0].options.headers.Authorization,'Bearer recovery-token');
 assert.deepEqual(JSON.parse(calls[0].options.body),{password:'new-password'});
 assert.equal(api.isPasswordRecovery(),false);
 assert.equal(api.loggedIn(),false);
});

test('Callback de link expirado informa erro e limpa parâmetros sensíveis da URL',async()=>{
 const {api,getReplacedUrl}=await loadApi('#error=access_denied&error_description=Email+link+expired',async()=>{throw new Error('fetch não esperado');});

 assert.equal(api.isPasswordRecovery(),true);
 assert.equal(api.passwordRecoveryError(),'Email link expired');
 assert.equal(getReplacedUrl(),'/');
});
