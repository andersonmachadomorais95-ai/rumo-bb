"""Importador administrativo. URL por argumento, segredo somente getpass/env. Nunca usar no navegador."""
import sys,os,json,getpass,urllib.request,urllib.error
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import CONTENT,QUESTIONS,ANSWERS,EXPLANATIONS,SOURCES,PACKAGE
url=sys.argv[1].rstrip('/') if len(sys.argv)>1 else input('URL do projeto Supabase: ').strip().rstrip('/')
if not url.startswith('https://') or not url.endswith('.supabase.co'):raise SystemExit('Use a URL HTTPS oficial do projeto')
key=os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or getpass.getpass('Chave service_role (entrada oculta, não será salva): ')
def request(path,data,content_type='application/json',headers=None):
 body=json.dumps(data,ensure_ascii=False).encode() if content_type=='application/json' else data
 req=urllib.request.Request(url+path,data=body,method='POST',headers={'apikey':key,'Authorization':'Bearer '+key,'Content-Type':content_type,**(headers or {})})
 try:
  with urllib.request.urlopen(req,timeout=120) as r:return r.status
 except urllib.error.HTTPError as e:raise RuntimeError(f'Falha HTTP {e.code} ao importar {path}; nenhuma credencial foi registrada') from None
for qid,q in QUESTIONS.items():
 explanations=sorted([x for x in EXPLANATIONS if x['questao_id']==qid],key=lambda x:x['autoria']!='IA_revisao_editorial_com_calculo')
 source=next(({'documento_id':s['documento_id'],'pagina_inicio':s['pagina_inicio']} for s in SOURCES if s['questao_id']==qid and s['documento_id']),None)
 request('/rest/v1/bb_questions',{'id':qid,'payload':q,'correction':{'answer':ANSWERS[qid]['resposta'],'explanations':explanations,'source':source}},headers={'Prefer':'resolution=merge-duplicates'})
for d in CONTENT['documents']:
 request('/storage/v1/object/bb-content/'+d['caminho_storage'],(PACKAGE/'storage'/d['caminho_storage']).read_bytes(),'application/pdf',{'x-upsert':'true'})
request('/rest/v1/bb_content',{'id':'bootstrap','payload':CONTENT},headers={'Prefer':'resolution=merge-duplicates'})
print('Conteúdo liberado e biblioteca importados. Histórico de usuários preservado. Valide login, RLS e restauração antes do uso definitivo.')
