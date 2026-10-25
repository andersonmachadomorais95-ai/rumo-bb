import sys,os,tempfile,json,uuid,unittest,urllib.request,urllib.error,threading
from pathlib import Path
temp=tempfile.TemporaryDirectory(prefix='BB teste á ')
os.environ['BB_DATA_DIR']=temp.name
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
class API(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);threading.Thread(target=cls.http.serve_forever,daemon=True).start();cls.url='http://127.0.0.1:'+str(cls.http.server_port)
 @classmethod
 def tearDownClass(cls):cls.http.shutdown();cls.http.server_close()
 def request(self,path,data=None,headers=None):
  req=urllib.request.Request(self.url+path,data=json.dumps(data).encode() if data is not None else None,headers=headers or {'Content-Type':'application/json','X-BB-App':'1'})
  with urllib.request.urlopen(req) as r:return json.load(r)
 def test_01_empty(self):
  d=self.request('/api/bootstrap');self.assertEqual(d['events'],[]);self.assertTrue(d['content']['questions']);self.assertFalse(any('correta' in a for a in d['content']['alternatives']))
 def test_10_guides_exams_and_pdf_page_index(self):
  content=self.request('/api/bootstrap')['content']
  guides={document['display_title'] for document in content['documents'] if document['tipo']=='guia' and document.get('display_title')}
  self.assertEqual(guides,{f'Semana-{week}' for week in range(1,13)})
  lesson_titles={document.get('display_title') for document in content['documents'] if document['tipo']=='teoria'}
  self.assertIn('Números inteiros',lesson_titles)
  self.assertIn('Gramática — Parte II e texto',lesson_titles)
  disciplines={item['nome']:item['id'] for item in content['disciplines']}
  math_documents={document['id'] for document in content['documents'] if document['disciplina_id']==disciplines['Matemática'] and document.get('display_title')}
  english_documents={document['id'] for document in content['documents'] if document['disciplina_id']==disciplines['Língua Inglesa'] and document.get('display_title')}
  self.assertTrue(math_documents)
  self.assertTrue(english_documents)
  self.assertGreaterEqual(len(content['theory']),450)
  documents={document['id']:document for document in content['documents']}
  subjects={subject['id']:subject for subject in content['subjects']}
  for section in content['theory']:
   self.assertIn(section['documento_id'],documents)
   self.assertGreaterEqual(section['pagina_inicio'],1)
   self.assertLessEqual(section['pagina_fim'],documents[section['documento_id']]['paginas'])
   if section['metodo'].startswith('pdf_'):
    self.assertEqual(subjects[section['assunto_id']]['disciplina_id'],documents[section['documento_id']]['disciplina_id'])
  self.assertTrue(any(section['documento_id'] in math_documents for section in content['theory']))
  self.assertTrue(any(section['documento_id'] in english_documents for section in content['theory']))
  for exam in content['exams']:
   roles={item['papel'] for item in content['examDocuments'] if item['prova_id']==exam['id']}
   self.assertIn('caderno_prova',roles)
   self.assertIn('gabarito',roles)
 def test_02_answer_idempotent_and_restore(self):
  q=server.CONTENT['questions'][0];eid=str(uuid.uuid4());e={'id':eid,'at':'2026-10-24T12:00:00Z','model':'bb-1.0','type':'answer','payload':{'questionId':q['id'],'sessionId':str(uuid.uuid4()),'index':0,'answer':server.ANSWERS[q['id']]['resposta'],'confidence':'seguro','consulted':False,'recognized':False}}
  a=self.request('/api/event',e);b=self.request('/api/event',e);self.assertEqual(len(a['events']),len(b['events']));self.assertTrue(b['events'][0]['payload']['correct'])
  backup=self.request('/api/export');self.request('/api/restore',backup);self.request('/api/restore',backup);self.assertEqual(len(self.request('/api/bootstrap')['events']),1);self.assertTrue(list((server.DATA/'backups').glob('*.sqlite3')))
 def test_03_invalid_import_atomic(self):
  before=self.request('/api/export');bad={**before,'events':[{'id':str(uuid.uuid4()),'type':'bad','at':'2026-10-24T12:00:00Z','payload':{}}]}
  with self.assertRaises(urllib.error.HTTPError):self.request('/api/restore',bad)
  self.assertEqual(self.request('/api/export'),before)
 def test_04_quarantine_blocked(self):
  q=next(q for q in server.load('questoes') if q['status']=='quarentena' and q['id'] not in server.QUESTIONS)
  e={'id':str(uuid.uuid4()),'type':'answer','at':'2026-10-24T12:00:00Z','payload':{'questionId':q['id']}}
  with self.assertRaises(urllib.error.HTTPError):self.request('/api/event',e)
 def test_08_practice_content_is_structurally_answerable(self):
  self.assertEqual(server.CONTENT['coverage']['released'],5025)
  self.assertEqual(server.CONTENT['coverage']['quarantine'],975)
  self.assertEqual(server.CONTENT['coverage']['reviewPending'],5003)
  source_files={}
  for source in server.SOURCES:
   source_files.setdefault(source['questao_id'],[]).append(source.get('arquivo_original',''))
  extracted_ids={
   qid for qid,files in source_files.items()
   if any('extraidas-' in file for file in files)
   and all('extraidas-' in file for file in files)
  }
  self.assertEqual(len(extracted_ids),851)
  self.assertTrue(extracted_ids.isdisjoint({q['id'] for q in server.CONTENT['questions']}))
  alternatives={}
  for a in server.CONTENT['alternatives']:alternatives.setdefault(a['questao_id'],[]).append(a)
  for q in server.CONTENT['questions']:
   answer=server.ANSWERS[q['id']]['resposta']
   self.assertGreaterEqual(len(alternatives[q['id']]),2)
   self.assertIn(answer,{a['letra'] for a in alternatives[q['id']]})
   self.assertFalse({'familia_com_gabaritos_divergentes','elemento_visual_ausente','contexto_ou_visual_a_conferir'}.intersection(q['motivos']))
 def test_09_unresolved_visual_or_answer_conflicts_are_blocked(self):
  from content_policy import is_practice_eligible
  alternatives=[{'letra':'a'},{'letra':'b'}]
  answer={'resposta':'a'}
  for reason in (
   'estrutura_incompleta',
   'gabarito_flags_divergentes',
   'familia_com_gabaritos_divergentes',
   'elemento_visual_ausente',
   'contexto_ou_visual_a_conferir',
  ):
   with self.subTest(reason=reason):
    self.assertFalse(is_practice_eligible({'motivos':[reason]},alternatives,answer))
 def test_05_csrf_rejected(self):
  with self.assertRaises(urllib.error.HTTPError):self.request('/api/event',{},headers={'Content-Type':'application/json','X-BB-App':'1','Origin':'https://example.com'})
 def test_06_pdf(self):
  d=server.CONTENT['documents'][0]
  with urllib.request.urlopen(self.url+'/files/'+d['caminho_storage']) as r:self.assertEqual(r.read(4),b'%PDF')
 def test_07_sqlite_reopen(self):
  with server.connect() as c:self.assertEqual(len(server.all_events(c)),1)
if __name__=='__main__':unittest.main()
