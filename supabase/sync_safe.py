"""Sincronização privada com snapshot, sem excluir questões ou histórico."""
import sys,os,json,time,urllib.request,urllib.error,urllib.parse,datetime
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import upload
from server import CONTENT
URL='https://fwqvycggbfdcpjogbfnr.supabase.co'
def main():
 secret=Path(os.environ['TEMP'])/'rumo-bb-import-key'
 key=secret.read_text().strip();secret.unlink()
 def req(path,data=None,method='GET',extra=None,raw=False):
  headers={'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json',**(extra or {})}
  body=None if data is None else data if raw else json.dumps(data,ensure_ascii=False).encode()
  for attempt in range(3):
   try:
    with urllib.request.urlopen(urllib.request.Request(URL+path,data=body,headers=headers,method=method),timeout=120) as r:
     b=r.read();return json.loads(b) if b and not raw else None
   except urllib.error.HTTPError as e:
    if e.code>=500 and attempt<2:time.sleep(2);continue
    raise RuntimeError(f'HTTP {e.code}: {path.split("?")[0]}') from None
 def table(name):
  result=[]
  for offset in range(0,100000,1000):
   batch=req(f'/rest/v1/{name}?select=*&order=id&offset={offset}&limit=1000');result+=batch
   if len(batch)<1000:return result
  raise RuntimeError('Pagination limit')
 old=table('bb_questions');oldcontent=table('bb_content');oldquarantine=table('bb_quarantine')
 backup=Path(os.environ['LOCALAPPDATA'])/'RumoBB'/'content-backups';backup.mkdir(parents=True,exist_ok=True)
 snapshot=backup/('before-sync-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.json')
 snapshot.write_text(json.dumps({'questions':old,'content':oldcontent,'quarantine':oldquarantine},ensure_ascii=False),encoding='utf-8')
 print('Snapshot de conteúdo salvo:',snapshot,flush=True)
 rows=upload.build_question_rows();previous={q['id']:q for q in old}
 for q in rows:
  prior=previous.get(q['id'])
  if prior and prior['correction'].get('answer')!=q['correction'].get('answer'):
   raise RuntimeError('Gabarito divergente: sincronização interrompida antes de alterar conteúdo')
 for start in range(0,len(rows),50):
  req('/rest/v1/bb_questions?on_conflict=id',rows[start:start+50],'POST',{'Prefer':'resolution=merge-duplicates,return=minimal'})
 print('Questões preparadas:',len(rows),flush=True)
 files=upload.document_files()
 for i,(document,path,size) in enumerate(files):
  target='/storage/v1/object/bb-content/'+urllib.parse.quote(document['caminho_storage'])
  # Arquivos por conteúdo recebem o mesmo caminho; preservar objetos existentes.
  try:req('/storage/v1/object/info/bb-content/'+urllib.parse.quote(document['caminho_storage']))
  except RuntimeError as error:
   if 'HTTP 400' not in str(error) and 'HTTP 404' not in str(error):raise
   req(target,path.read_bytes(),'POST',{'Content-Type':'application/pdf','x-upsert':'false'},True)
  if (i+1)%20==0:print('PDFs verificados:',i+1,'/',len(files),flush=True)
 active={q['id'] for q in rows}
 for q in old:
  if q['id'] not in active and q['payload'].get('status')=='liberada':
   payload={**q['payload'],'status':'quarentena','retirada_pratica':'sincronizacao_2026-10-25'}
   req('/rest/v1/bb_questions?id=eq.'+q['id'],{'payload':payload},'PATCH',{'Prefer':'return=minimal'})
 req('/rest/v1/bb_content?on_conflict=id',{'id':'bootstrap','payload':CONTENT},'POST',{'Prefer':'resolution=merge-duplicates,return=minimal'})
 live=table('bb_questions');enabled={q['id'] for q in live if q['payload'].get('status')=='liberada'}
 assert enabled==active,'Conjunto ativo divergente'
 check=table('bb_content');boot=next(r['payload'] for r in check if r['id']=='bootstrap')
 assert {q['id'] for q in boot['questions']}==active
 print('VERIFICADO:',len(active),'questões respondíveis;',len(files),'PDFs; histórico não alterado.',flush=True)
if __name__=='__main__':main()

