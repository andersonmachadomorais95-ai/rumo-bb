import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, makePlan, MODEL, reduce, selectQuestions, theoryForSubject } from '../web/engine.mjs';

const content = {
 subjects: [
  { id: 's', nome: 'Língua Portuguesa', disciplina_id: 'd' },
  { id: 't', nome: 'Outro tema', disciplina_id: 'd' },
  { id: 'excluded', nome: 'Redação', disciplina_id: 'essay' },
 ],
 disciplines: [
  { id: 'd', nome: 'Língua Portuguesa', weight: 1.5 },
  { id: 'essay', nome: 'Redação', weight: 0, impacta_diagnostico_objetivo: false },
 ],
 questions: Array.from({ length: 35 }, (_, index) => ({
  id: `q${index}`,
  familia_id: `f${index}`,
  assunto_id: index < 25 ? 's' : index < 30 ? 't' : 'excluded',
  versao: 1,
  dificuldade: index < 3 ? 'dificil' : null,
  dificuldade_metodo: index < 3 ? 'estimativa_da_fonte' : null,
 })),
 theory: [
  { assunto_id: 's', documento_id: 'doc', pagina_inicio: 1, pagina_fim: 2, titulo: 'Trecho específico', metodo: 'conferencia_editorial' },
  { assunto_id: 't', documento_id: 'doc', pagina_inicio: 3, pagina_fim: 4, titulo: 'Outro trecho', metodo: 'conferencia_editorial' },
 ],
};

const answer = (index, correct = true, extra = {}) => ({
 id: `e${index}-${extra.at || 'first'}`,
 type: 'answer',
 at: extra.at || '2026-10-01T12:00:00-03:00',
 payload: {
  questionId: `q${index}`,
  familyId: `f${index}`,
  answer: correct ? 'A' : 'B',
  correct,
  confidence: 'seguro',
  consulted: false,
  recognized: false,
  ...extra,
 },
});

test('diagnóstico inicial curto sugere teoria e prática sem exceder 120 minutos', () => {
 const diagnosis = diagnose(content, []);
 const plan = makePlan(content, [], new Date(2026, 9, 26, 9));
 assert.equal(MODEL, 'bb-3.0');
 assert.equal(diagnosis.subjects.find(item => item.id === 's').mastery, 'Ainda estamos conhecendo seu desempenho');
 assert.ok(plan.tasks.some(task => task.kind === 'theory'));
 assert.ok(plan.tasks.some(task => task.kind === 'practice'));
 assert.ok(plan.tasks.length <= 8);
 assert.ok(plan.planned <= 120);
 assert.ok(plan.tasks.every(task => task.reason.length > 20));
});

test('separa prioridade histórica, domínio, urgência e confiança', () => {
 const [topic] = diagnose(content, [answer(0)], new Date(2026, 9, 2, 9)).subjects;
 assert.ok(topic.historicalPriority > 0);
 assert.ok(topic.historicalIncidence > 0);
 assert.equal(topic.masteryEstimate, null);
 assert.equal(topic.reviewUrgency > 0, true);
 assert.equal(topic.diagnosisConfidence, 'inicial');
});

test('repetição imediata não infla domínio nem conta como retenção', () => {
 const first = answer(0);
 const repeated = { ...answer(0, true, { at: '2026-10-01T13:00:00-03:00' }), id: 'repeat' };
 const one = diagnose(content, [first]).subjects[0];
 const many = diagnose(content, [first, repeated, { ...repeated, id: 'repeat-again' }]).subjects[0];
 assert.equal(many.rawEvidenceWeight, one.rawEvidenceWeight);
 assert.equal(many.newN, 1);
 assert.equal(many.retentionN, 0);
});

test('uma nova tentativa só mede retenção após sete dias locais', () => {
 const first = answer(0);
 const tooSoon = answer(0, false, { at: '2026-10-07T11:59:00-03:00' });
 const spaced = answer(0, true, { at: '2026-10-08T00:01:00-03:00' });
 const early = diagnose(content, [first, tooSoon], new Date(2026, 9, 9)).subjects[0];
 const later = diagnose(content, [first, spaced], new Date(2026, 9, 9)).subjects[0];
 assert.equal(early.retentionN, 0);
 assert.equal(later.retentionN, 1);
});

test('consulta, reconhecimento e resposta insegura não comprovam domínio', () => {
 const diagnosis = diagnose(content, [
  answer(0, true, { consulted: true }),
  answer(1, true, { recognized: true }),
  answer(2, true, { confidence: 'inseguro' }),
 ]);
 const topic = diagnosis.subjects.find(item => item.id === 's');
 assert.equal(topic.newN, 1);
 assert.ok(topic.rawEvidenceWeight < 1);
 assert.equal(topic.diagnosisConfidence, 'inicial');
});

test('repetição imediata após consulta não vira questão nova; tentativa tardia pode iniciar evidência', () => {
 const consulted = answer(0, true, { consulted: true });
 const immediate = answer(0, true, { at: '2026-10-01T13:00:00-03:00' });
 const afterWeek = answer(0, true, { at: '2026-10-08T13:00:00-03:00' });
 assert.equal(diagnose(content, [consulted, immediate]).subjects[0].newN, 0);
 assert.equal(diagnose(content, [consulted, afterWeek]).subjects[0].newN, 0);
});

test('manutenção exige amostra ampla e respostas espaçadas', () => {
 const events = Array.from({ length: 12 }, (_, index) => answer(index));
 for (const index of [0, 1, 2]) {
  events.push(answer(index, true, { at: '2026-10-10T12:00:00-03:00' }));
 }
 const topic = diagnose(content, events, new Date(2026, 9, 11)).subjects[0];
 assert.equal(topic.newN, 12);
 assert.equal(topic.retentionN, 3);
 assert.equal(topic.mastery, 'Manutenção');
});

test('erros recorrentes elevam prioridade sem ocultar outros assuntos', () => {
 const wrong = [0, 1, 2, 3].map(index => answer(index, false));
 const right = [0, 1, 2, 3].map(index => answer(index));
 const weak = diagnose(content, wrong, new Date(2026, 9, 2)).subjects[0];
 const strong = diagnose(content, right, new Date(2026, 9, 2)).subjects[0];
 assert.equal(weak.recurrentErrors, 4);
 assert.ok(weak.priority > strong.priority);
 const plan = makePlan(content, wrong.map((item, index) => index === 0 ? { type: 'plan', payload: { day: '2026-10-01', tasks: [{ subjectId: 's' }] } } : item), new Date(2026, 9, 2));
 assert.ok(new Set(plan.tasks.map(task => task.subjectId)).size > 1);
});

test('resultados externos antigos não participam mais do diagnóstico nem do plano', () => {
 const events = [{
  type: 'task',
  at: '2026-10-01T12:00:00-03:00',
  payload: { taskId: 'legacy-external', status: 'done', minutes: 20, externalResult: { provider: 'Gran', subjectId: 's', total: 100, correct: 100 } },
 }];
 const topic = diagnose(content, events).subjects[0];
 assert.equal(topic.newN, 0);
 assert.equal(topic.retentionN, 0);
 assert.equal(topic.masteryEstimate, null);
 assert.equal(Object.hasOwn(topic, 'externalN'), false);
 assert.ok(makePlan(content, [], new Date(2026, 9, 24)).tasks.every(task => task.kind !== 'gran'));
});

test('mapa do acervo direciona o assunto ao capítulo e à página do PDF', () => {
 const mapped = {
  ...content,
  theory: [],
  documents: [{ id: 'doc', tipo: 'teoria', canonica: true, disciplina_id: 'd' }],
  sections: [{ documento_id: 'doc', titulo: 'Outro tema', pagina_inicio: 18, pagina_fim: 21 }],
 };
 assert.equal(theoryForSubject(mapped, 't').pagina_inicio, 18);
 assert.equal(theoryForSubject(mapped, 'excluded'), null);
});

test('plano atual legado é substituído sem preservar tarefa externa', () => {
 const day = '2026-10-26';
 const oldPlan = { ...makePlan(content, [], new Date(2026, 9, 26)), model: 'bb-2.0' };
 oldPlan.tasks.push({ id: 'old-gran', kind: 'gran', subjectId: 's', minutes: 20 });
 const events = [{ type: 'plan', payload: oldPlan }];
 const replacement = makePlan(content, events, new Date(2026, 9, 26));
 assert.equal(replacement.day, day);
 assert.equal(replacement.model, MODEL);
 assert.ok(replacement.tasks.every(task => task.kind !== 'gran'));
 assert.equal(reduce([...events, { type: 'plan', payload: replacement }]).plans[day].model, MODEL);
});

test('a leitura e a marcação de material não entram como evidência de domínio', () => {
 const events = [
  { type: 'reading', payload: { documentId: 'doc', done: true } },
  { type: 'task', payload: { taskId: 'read', status: 'done', minutes: 120 } },
 ];
 const topic = diagnose(content, events).subjects[0];
 assert.equal(topic.rawEvidenceWeight, 0);
 assert.equal(topic.newN, 0);
});

test('a dificuldade só vem de classificação cadastrada, nunca do tamanho da questão', () => {
 const topic = diagnose(content, [answer(0)]).subjects[0];
 assert.equal(topic.difficultyEstimate.label, 'estimativa cadastrada na fonte');
 assert.equal(topic.difficultyEstimate.dificil, 3);
 const unknownContent = { ...content, questions: content.questions.map(item => ({ ...item, enunciado: 'x'.repeat(5000), dificuldade: null, dificuldade_metodo: null })) };
 const unknown = diagnose(unknownContent, []).subjects[0];
 assert.match(unknown.difficultyEstimate.label, /sem inferência por tamanho/);
});

test('plano do dia permanece estável e tarefas feitas continuam registradas', () => {
 const date = new Date(2026, 9, 26, 9), plan = makePlan(content, [], date);
 const events = [
  { type: 'plan', payload: plan },
  answer(0, false),
  { type: 'task', payload: { taskId: plan.tasks[0].id, status: 'done', minutes: 15 } },
 ];
 assert.deepEqual(makePlan(content, events, date), plan);
 assert.equal(reduce(events).tasks[plan.tasks[0].id].status, 'done');
});

test('segunda a sábado têm plano, domingo descansa e tarefas pendentes não acumulam', () => {
 const saturday = makePlan(content, [{type:'settings',payload:{days:[6]}}], new Date(2026, 9, 24, 9));
 const sunday = makePlan(content, [], new Date(2026, 9, 25, 9));
 const monday = makePlan(content, [], new Date(2026, 9, 26, 9));
 assert.equal(saturday.rest, false);
 assert.ok(saturday.tasks.some(task => task.kind === 'practice'));
 assert.ok(saturday.tasks.every(task => task.kind !== 'gran'));
 assert.equal(sunday.rest, true);
 assert.equal(monday.rest, false);
 assert.ok(monday.planned <= 120);
 assert.equal(monday.tasks.some(task => task.id.includes('2026-10-24')), false);
});

test('reconhece a transição de data local e não faz plano retroativo', () => {
 const events = [{ type: 'plan', payload: { day: '2026-10-23', tasks: [{ subjectId: 's' }] } }];
 const today = makePlan(content, events, new Date(2026, 9, 26, 0, 1));
 assert.equal(today.day, '2026-10-26');
 assert.ok(today.tasks.every(task => task.id.startsWith('2026-10-26')));
});

test('preserva dias escolhidos no histórico e limita disponibilidade diária a duas horas', () => {
 const migrated = reduce([{ type: 'settings', payload: { name: 'A', minutes: 240, days: [1, 2, 3, 4, 5] } }]).settings;
 assert.deepEqual(migrated.days, [1, 2, 3, 4, 5]);
 assert.equal(migrated.minutes, 120);
 const explicitWeekdays = reduce([{ type: 'settings', payload: { name: 'A', minutes: 90, days: [1, 2, 3, 4, 5], scheduleVersion: 2 } }]).settings;
 assert.deepEqual(explicitWeekdays.days, [1, 2, 3, 4, 5]);
});

test('questões repetidas ficam fora do bloco imediato e itens não objetivos do diagnóstico', () => {
 const events = [answer(0)];
 assert.ok(!selectQuestions(content, events, 's', 30, new Date('2026-10-01T13:00:00-03:00')).includes('q0'));
 assert.equal(diagnose(content, [answer(30)]).subjects.some(item => item.id === 'excluded'), false);
 assert.equal(diagnose({ ...content, questions: [] }, [answer(0)]).subjects[0].n, 0);
});

 test('domingo pode ser escolhido e assuntos sem questões não quebram o planejamento',()=>{
 const custom=[{type:'settings',payload:{days:[0],startTime:'08:30'}}];
 assert.equal(reduce(custom).settings.startTime,'08:30');
 assert.equal(makePlan({...content,questions:[]},custom,new Date(2026,9,25,9)).rest,false);
 assert.equal(makePlan(content,custom,new Date(2026,9,26,9)).rest,true);
 });

 test('dia livre oferece plano opcional sem alterar rotina',()=>{
 const date=new Date(2026,9,25,9);
 assert.equal(makePlan(content,[],date).rest,true);
 const optional=makePlan(content,[],date,{optional:true});
 assert.ok(optional.tasks.some(t=>t.questionIds?.length));
 assert.equal(optional.optional,true);
 assert.equal(reduce([{type:'plan',payload:optional}]).settings.days.includes(0),false);
 assert.deepEqual(makePlan(content,[{type:'plan',payload:optional}],date),optional);
 });
 test('nova versão e mudança de rotina preservam tarefas iniciadas e concluídas',()=>{
 const date=new Date(2026,9,26,9),plan=makePlan(content,[],date);
 const keep=plan.tasks[0];
 const events=[{type:'plan',payload:{...plan,model:'old'}},{type:'task',payload:{taskId:keep.id,status:'started'}},{type:'settings',payload:{days:[1],minutes:60}}];
 const changed=makePlan(content,events,date);
 assert.ok(changed.tasks.some(t=>t.id===keep.id));
 assert.ok(changed.planned<=60);
 const ids=changed.tasks.flatMap(t=>t.questionIds||[]);
 assert.equal(ids.length,new Set(ids).size);
 });
