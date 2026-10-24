"""Servidor local de desenvolvimento com SQLite persistente. Produção usa Supabase."""
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote,urlsplit
import os,json,sqlite3,datetime,uuid,hashlib,mimetypes,shutil
from contextlib import contextmanager,closing
ROOT=Path(__file__).resolve().parent
PACKAGE=ROOT.parent/'Gran Banco do Brasil'/'pacote-conteudo-v1'
DATA=Path(os.environ.get('BB_DATA_DIR',str(Path(os.environ.get('LOCALAPPDATA',Path.home()))/'RumoBB')))
DATA.mkdir(parents=True,exist_ok=True)
DB=DATA/'historico.sqlite3'
@contextmanager
def connect():
 c=sqlite3.connect(DB,timeout=20)
 try:
  c.execute('pragma journal_mode=WAL');c.execute('create table if not exists events(id text primary key, body text not null)');c.execute('create table if not exists imports(hash text primary key)');c.commit()
  yield c
  c.commit()
 except Exception:
  c.rollback();raise
 finally:c.close()
def load(name):return json.loads((PACKAGE/'dados'/f'{name}.json').read_text(encoding='utf8'))['registros']
def build_content():
 qs=load('questoes');questions=[q for q in qs if q['status']=='liberada'];ids={q['id'] for q in questions};discs=load('disciplinas')
 weights={'Língua Portuguesa':15,'Língua Inglesa':5,'Matemática':7.5,'Matemática Financeira':7.5,'Atualidades do Mercado Financeiro':5,'Conhecimentos Bancários':15,'Conhecimentos de Informática':22.5,'Vendas e Negociação':22.5}
 for d in discs:d['weight']=weights[d['nome']]/10
 return {'version':'1.0','questions':questions,'subjects':load('assuntos'),'disciplines':discs,'alternatives':[a for a in load('alternativas') if a['questao_id'] in ids],'contexts':load('contextos'),'documents':load('documentos'),'sections':load('secoes_documentos'),'attachments':[a for a in load('anexos') if a['tipo']!='link_externo'],'theory':load('trechos_teoria'),'coverage':{'total':len(qs),'released':len(ids),'quarantine':len(qs)-len(ids)}}
CONTENT=build_content()
QUESTIONS={q['id']:q for q in CONTENT['questions']}
ANSWERS={g['questao_id']:g for g in load('gabaritos')}
EXPLANATIONS=load('explicacoes');SOURCES=load('questao_fontes')
def all_events(c):return [json.loads(r[0]) for r in c.execute('select body from events order by rowid')]
def backup(c):
 folder=DATA/'backups';folder.mkdir(exist_ok=True)
 dest=folder/('historico-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')+'.sqlite3')
 with closing(sqlite3.connect(dest)) as b:c.backup(b)
 # Retenção limitada, apenas backups criados por este servidor.
 for old in sorted(folder.glob('historico-*.sqlite3'))[:-14]:old.unlink()
def validate(e):
 if not isinstance(e,dict) or set(e)-{'id','type','payload','at','model'}:raise ValueError('Evento inválido')
 uuid.UUID(e['id']);datetime.datetime.fromisoformat(e['at'].replace('Z','+00:00'))
 t=e['type'];p=e['payload']
 if t not in ['settings','plan','task','session','answer','close','reading'] or not isinstance(p,dict):raise ValueError('Tipo de registro inválido')
 if len(json.dumps(e))>100000:raise ValueError('Registro muito grande')
 if t=='settings':
  if not isinstance(p.get('name'),str) or not 1<=len(p['name'].strip())<=60:raise ValueError('Nome inválido')
  if not isinstance(p.get('minutes'),int) or not 15<=p['minutes']<=240:raise ValueError('Tempo inválido')
  if not isinstance(p.get('days'),list) or not p['days'] or any(type(d)!=int or d not in range(7) for d in p['days']):raise ValueError('Dias inválidos')
 if t=='task' and (p.get('status') not in ['started','done'] or not 0<=p.get('minutes',0)<=240):raise ValueError('Tarefa inválida')
 if t=='plan' and (sum(t.get('minutes',0) for t in p.get('tasks',[]))>240 or any(t.get('minutes',0)<0 for t in p.get('tasks',[]))):raise ValueError('Plano inválido')
 if t=='answer':
  q=QUESTIONS.get(p.get('questionId'))
  if not q:raise ValueError('Questão indisponível ou retirada para revisão. Sua resposta não foi pontuada.')
  labels=[a['letra'] for a in CONTENT['alternatives'] if a['questao_id']==q['id']]
  if p.get('answer') is not None and p['answer'] not in labels:raise ValueError('Alternativa inválida')
  if p.get('confidence') not in ['seguro','inseguro'] or type(p.get('consulted'))!=bool or type(p.get('recognized'))!=bool:raise ValueError('Condições da resposta inválidas')
  answer=ANSWERS[q['id']]['resposta'];p['correct']=p.get('answer')==answer;p['version']=q['versao'];p['familyId']=q['familia_id']
  explanations=sorted([x for x in EXPLANATIONS if x['questao_id']==q['id']],key=lambda x:x['autoria']!='IA_revisao_editorial_com_calculo')
  source=next(({'documento_id':s['documento_id'],'pagina_inicio':s['pagina_inicio']} for s in SOURCES if s['questao_id']==q['id'] and s['documento_id']),None)
  p['correction']={'answer':answer,'explanations':explanations,'source':source}
 return e
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def json(self,obj,status=200):
  b=json.dumps(obj,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
 def do_GET(self):
  path=unquote(urlsplit(self.path).path)
  if path=='/api/bootstrap':
   with connect() as c:return self.json({'content':CONTENT,'events':all_events(c)})
  if path=='/api/export':
   with connect() as c:return self.json({'format':'rumo-bb-history','version':1,'model':'bb-1.0','content_version':CONTENT['version'],'events':all_events(c)})
  base=PACKAGE/'storage' if path.startswith('/files/') else ROOT/'web';rel=path.removeprefix('/files/') if path.startswith('/files/') else path.lstrip('/') or 'index.html';f=(base/rel).resolve()
  if not f.is_relative_to(base.resolve()) or not f.is_file():return self.json({'error':'Arquivo não encontrado'},404)
  content=f.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(f.name)[0] or 'application/octet-stream');self.send_header('Content-Length',str(len(content)));self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(content)
 def do_POST(self):
  if self.headers.get('X-BB-App')!='1':return self.json({'error':'Origem não autorizada'},403)
  if self.headers.get('Origin') and self.headers['Origin'] not in [f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}']:return self.json({'error':'Origem não autorizada'},403)
  try:
   n=int(self.headers.get('Content-Length',0))
   if n>10_000_000:raise ValueError('Arquivo muito grande')
   obj=json.loads(self.rfile.read(n))
   if self.path=='/api/event':
    with connect() as c:
     existing=c.execute('select body from events where id=?',(obj.get('id'),)).fetchone()
     if not existing:
      e=validate(obj)
      if e['type']=='answer':
       for old in all_events(c):
        if old['type']=='answer' and old['payload'].get('sessionId')==e['payload'].get('sessionId') and old['payload'].get('index')==e['payload'].get('index'):raise ValueError('Esta resposta já foi registrada. Atualize para retomar.')
      c.execute('insert into events values(?,?)',(e['id'],json.dumps(e,ensure_ascii=False)))
     result=all_events(c)
    return self.json({'events':result})
   if self.path=='/api/restore':
    if obj.get('format')!='rumo-bb-history' or obj.get('version')!=1 or not isinstance(obj.get('events'),list):raise ValueError('Formato de backup incompatível')
    digest=hashlib.sha256(json.dumps(obj,sort_keys=True).encode()).hexdigest()
    with connect() as c:
     backup(c)
     if not c.execute('select 1 from imports where hash=?',(digest,)).fetchone():
      for e in obj['events']:
       if c.execute('select 1 from events where id=?',(e.get('id'),)).fetchone():continue
       validate(e);c.execute('insert into events values(?,?)',(e['id'],json.dumps(e,ensure_ascii=False)))
      c.execute('insert into imports values(?)',(digest,))
    return self.json({'ok':True})
   self.json({'error':'Rota inválida'},404)
  except (ValueError,KeyError,TypeError) as e:self.json({'error':str(e)},400)
  except Exception:self.json({'error':'Falha de gravação. Nenhum sucesso foi confirmado; tente novamente.'},500)
if __name__=='__main__':
 with connect() as c:backup(c)
 port=int(os.environ.get('PORT','8788'));print(f'Rumo BB: http://127.0.0.1:{port}',flush=True);ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
