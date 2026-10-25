import { bancaProfile } from './banca.mjs';

export const MODEL = 'bb-3.0';
export const DEFAULTS = { name: 'Luciano', minutes: 120, days: [1, 2, 3, 4, 5], startTime: '19:00', horizonDays: 90, scheduleVersion: 3 };

export const dayKey = (date = new Date()) => (
 `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

function localDayNumber(value) {
 const date = value instanceof Date ? value : new Date(value);
 if (Number.isNaN(date.getTime())) return null;
 return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

function daysBetween(a, b) {
 const first = localDayNumber(a), second = localDayNumber(b);
 return first === null || second === null ? 0 : second - first;
}

function familyOf(question) {
 return question.familia_id || question.id;
}

function normalized(value) {
 return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function historicalFor(discipline) {
 const record = bancaProfile.subjects.find(item => normalized(item.name) === normalized(discipline.nome));
 const totalPoints = bancaProfile.subjects
  .filter(item => item.group !== 'Contexto 2018')
  .reduce((sum, item) => sum + item.points, 0);
 if (record) {
  return {
   points: record.points,
   pointShare: record.points / totalPoints,
   questionsPerPaper: record.questions,
   incidence: record.questions * bancaProfile.years.length / bancaProfile.editionSummary.questions,
   years: bancaProfile.years.map(item => item.year),
   sample: bancaProfile.editionSummary.questions,
   source: 'provas comerciais de 2021 e 2023',
  };
 }
 const points = Number(discipline.weight) * 10 || 0;
 return {
  points,
  pointShare: points / totalPoints,
  questionsPerPaper: null,
  incidence: null,
  years: [],
  sample: 0,
  source: points ? 'peso estrutural histórico; incidência por matéria não classificada' : 'sem amostra histórica classificada',
 };
}

function latestPlanExposure(state, subjectId) {
 let latest = null;
 for (const plan of Object.values(state.plans)) {
  if (plan.day && plan.tasks?.some(task => task.subjectId === subjectId) && (!latest || plan.day > latest)) latest = plan.day;
 }
 return latest;
}

export function reduce(events) {
 const settings = { ...DEFAULTS };
 const state = { settings, attempts: [], plans: {}, tasks: {}, sessions: {}, closed: {}, reading: {} };
 for (const event of events) {
  const payload = event.payload || {};
  if (event.type === 'settings') {
   const days = Array.isArray(payload.days) ? payload.days.filter(day => Number.isInteger(day) && day >= 0 && day <= 6) : state.settings.days;
   state.settings = {
    ...state.settings,
    ...payload,
    minutes: Math.max(15, Math.min(120, Number(payload.minutes) || DEFAULTS.minutes)),
    days: [...new Set(days)],
    startTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(payload.startTime || '') ? payload.startTime : state.settings.startTime,
    horizonDays: 90,
    scheduleVersion: 3,
   };
  }
  if (event.type === 'answer') state.attempts.push({ ...payload, at: event.at, id: event.id });
  if (event.type === 'plan') state.plans[payload.day] = payload;
  if (event.type === 'task') state.tasks[payload.taskId] = payload;
  if (event.type === 'session') state.sessions[payload.id] = payload;
  if (event.type === 'close') state.closed[payload.day] = payload;
  if (event.type === 'reading') state.reading[payload.documentId] = payload;
 }
 return state;
}

export function diagnose(content, events, now = new Date()) {
 const state = reduce(events), subjectsById = {}, questions = Object.fromEntries(content.questions.map(question => [question.id, question]));
 const seen = new Map(), qualifiedByFamily = new Map(), latestFamilyOutcome = new Map();
 const disciplines = Object.fromEntries(content.disciplines.map(item => [item.id, item]));
 const objectiveDisciplines = new Set(content.disciplines.filter(item => item.impacta_diagnostico_objetivo !== false).map(item => item.id));

 for (const subject of content.subjects) {
  if (!objectiveDisciplines.has(subject.disciplina_id)) continue;
  const discipline = disciplines[subject.disciplina_id];
  subjectsById[subject.id] = {
   id: subject.id,
   name: subject.nome,
   disciplineId: subject.disciplina_id,
   n: 0,
   correct: 0,
   newN: 0,
   newCorrect: 0,
   errors: 0,
   insecure: 0,
   retentionN: 0,
   retentionCorrect: 0,
   rawEvidenceWeight: 0,
   weightedSuccess: 0,
   available: 0,
   newAvailable: 0,
   latestAnswer: null,
   lastEvidence: null,
   _families: new Set(),
   _difficulty: { facil: 0, media: 0, dificil: 0 },
   historical: historicalFor(discipline || {}),
  };
 }

 const catalogFamilies = new Map();
 for (const question of content.questions) {
  const topic = subjectsById[question.assunto_id];
  if (!topic) continue;
  topic.available++;
  const family = familyOf(question);
  if (!catalogFamilies.has(topic.id)) catalogFamilies.set(topic.id, new Set());
  catalogFamilies.get(topic.id).add(family);
  if (['facil', 'media', 'dificil'].includes(question.dificuldade) && question.dificuldade_metodo) {
   topic._difficulty[question.dificuldade]++;
  }
 }

 const attempts = state.attempts.slice().sort((a, b) => new Date(a.at) - new Date(b.at));
 for (const attempt of attempts) {
  const question = questions[attempt.questionId], topic = question && subjectsById[question.assunto_id];
  if (!topic) continue;
  const family = attempt.familyId || question.familia_id || question.id;
  const previousSeen = seen.get(family);
  topic.n++;
  topic.correct += attempt.correct ? 1 : 0;
  topic.errors += attempt.correct ? 0 : 1;
  topic.insecure += attempt.confidence === 'inseguro' ? 1 : 0;
  if (!topic.latestAnswer || new Date(attempt.at) >= new Date(topic.latestAnswer.at)) topic.latestAnswer = attempt;
  if (!previousSeen || new Date(attempt.at) >= new Date(previousSeen.at)) seen.set(family, attempt);

  const qualified = !attempt.consulted && !attempt.recognized && (attempt.answer === null || typeof attempt.answer === 'string');
  if (!qualified) continue;
  const previousEvidence = qualifiedByFamily.get(family);
  const eligibleAfter = previousEvidence?.at || previousSeen?.at;
  const elapsed = eligibleAfter ? daysBetween(eligibleAfter, attempt.at) : null;
  const fresh = !previousEvidence;
  const spaced = elapsed !== null && elapsed >= 7;
  if (fresh && previousSeen && !spaced) continue;
  if (!fresh && !spaced) continue;

  const confidenceWeight = attempt.confidence === 'inseguro' ? 0.65 : 1;
  const answerWeight = attempt.answer === null ? 0.6 : 1;
  const spacingWeight = fresh ? 1 : 0.7;
  const ageDays = Math.max(0, daysBetween(attempt.at, now));
  const recencyWeight = Math.pow(0.5, ageDays / 180);
  const weight = confidenceWeight * answerWeight * spacingWeight * recencyWeight;
  topic.rawEvidenceWeight += weight;
  topic.weightedSuccess += weight * (attempt.correct ? 1 : 0);
  topic._families.add(family);
  topic.lastEvidence = attempt.at;
  qualifiedByFamily.set(family, attempt);

  if (fresh && !previousSeen) {
   topic.newN++;
   topic.newCorrect += attempt.correct ? 1 : 0;
  } else {
   topic.retentionN++;
   topic.retentionCorrect += attempt.correct ? 1 : 0;
  }
  latestFamilyOutcome.set(family, { subjectId: topic.id, at: attempt.at, correct: !!attempt.correct });
 }

 const recentWrongBySubject = new Map();
 for (const [family, outcome] of latestFamilyOutcome) {
  if (outcome.correct || daysBetween(outcome.at, now) > 30) continue;
  if (!recentWrongBySubject.has(outcome.subjectId)) recentWrongBySubject.set(outcome.subjectId, new Set());
  recentWrongBySubject.get(outcome.subjectId).add(family);
 }

 const today = dayKey(now), topics = Object.values(subjectsById);
 for (const topic of topics) {
  const catalog = catalogFamilies.get(topic.id) || new Set();
  topic.newAvailable = [...catalog].filter(family => !seen.has(family)).length;
  topic.uniqueEvidence = topic._families.size;
  topic.evidenceWeight = topic.rawEvidenceWeight;
  topic.recurrentErrors = recentWrongBySubject.get(topic.id)?.size || 0;
  topic.estimate = (2 + topic.weightedSuccess) / (4 + topic.rawEvidenceWeight);
  topic.masteryEstimate = topic.uniqueEvidence >= 5 ? topic.estimate : null;
  topic.uncertainty = Math.min(1, 1.96 * Math.sqrt(topic.estimate * (1 - topic.estimate) / (4 + topic.rawEvidenceWeight)));
  topic.diagnosisConfidence = topic.uniqueEvidence < 5
   ? 'inicial'
   : topic.uniqueEvidence < 10 || topic.retentionN < 2
    ? 'em formação'
    : topic.uniqueEvidence >= 20 && topic.retentionN >= 4
     ? 'consistente'
     : 'moderada';
  topic.mastery = topic.uniqueEvidence < 5
   ? 'Ainda estamos conhecendo seu desempenho'
   : topic.estimate < 0.5 || topic.recurrentErrors >= 3
    ? 'Construir a base'
    : topic.estimate >= 0.8 && topic.newN >= 12 && topic.retentionN >= 3
     ? 'Manutenção'
     : 'Em desenvolvimento';

  const gap = topic.lastEvidence ? daysBetween(topic.lastEvidence, now) : 0;
  const targetInterval = topic.recurrentErrors > 0 || topic.estimate < 0.5 ? 3 : topic.estimate >= 0.75 ? 21 : 7;
  topic.reviewUrgency = topic.lastEvidence ? Math.max(0, Math.min(1, gap / targetInterval)) : 0;
  topic.historicalPriority = topic.historical.pointShare;
  topic.historicalIncidence = topic.historical.incidence;
  topic.coverageGap = Math.max(0, 1 - topic.newN / 8);
  topic.priority = (
   topic.historicalPriority * 0.35
   + (1 - topic.estimate) * 0.2
   + topic.reviewUrgency * 0.2
   + topic.coverageGap * 0.15
   + Math.min(1, topic.recurrentErrors / 3) * 0.1
  );
  topic.nextActivity = topic.uniqueEvidence < 3 || topic.recurrentErrors >= 2 || topic.estimate < 0.5
   ? 'teoria direcionada e bloco curto'
   : topic.reviewUrgency >= 0.65
    ? 'revisão espaçada com questões'
    : topic.uniqueEvidence >= 12 && topic.estimate >= 0.75
     ? 'questões novas e cobertura'
     : 'prática local e verificação';
  topic.estimatedNextMinutes = topic.nextActivity === 'teoria direcionada e bloco curto' ? 35 : topic.nextActivity === 'revisão espaçada com questões' ? 20 : 25;
  topic.expectedLearningValue = (
   (1 - topic.estimate) * 0.35
   + topic.reviewUrgency * 0.25
   + topic.uncertainty * 0.2
   + topic.coverageGap * 0.2
  );
  topic.costBenefit = (
   (topic.historicalPriority + 0.05) * topic.expectedLearningValue
   / (topic.estimatedNextMinutes / 15)
  );
  topic.confidenceLabel = topic.uniqueEvidence < 5 ? 'Ainda estamos conhecendo seu desempenho' : `Diagnóstico ${topic.diagnosisConfidence}`;

  const last = topic.latestAnswer, lastWrong = last && !last.correct;
  topic.reason = topic.uniqueEvidence < 3
   ? 'Ainda estamos conhecendo seu desempenho; vamos começar com uma explicação curta e um pequeno bloco de questões.'
   : topic.recurrentErrors >= 2
    ? 'Mais de uma questão nova recente apontou a mesma lacuna; uma retomada curta pode ajudar antes de outro bloco.'
    : topic.reviewUrgency >= 0.65
     ? 'Já houve prática neste tema, e chegou o momento de verificar o que ficou depois de alguns dias.'
     : topic.estimate < 0.5
      ? 'As respostas sem consulta mostram uma lacuna provável; vamos retomar um trecho específico e praticar em seguida.'
      : topic.uniqueEvidence < 10
       ? 'A amostra ainda é pequena; vamos ampliar a cobertura com questões diferentes antes de concluir como está seu domínio.'
       : topic.estimate >= 0.8 && topic.retentionN >= 3
        ? 'O desempenho recente e espaçado parece estável; vamos preservar a retenção com questões novas.'
        : lastWrong
         ? 'A última questão trouxe um erro; vamos conferir o raciocínio sem transformar uma resposta isolada em diagnóstico.'
         : 'Vamos ampliar a evidência com prática e manter espaço para outros assuntos.';

  const difficulties = topic._difficulty, difficultyN = difficulties.facil + difficulties.media + difficulties.dificil;
  topic.difficultyEstimate = difficultyN >= 3
   ? { ...difficulties, sample: difficultyN, label: 'estimativa cadastrada na fonte' }
   : { facil: 0, media: 0, dificil: 0, sample: difficultyN, label: 'amostra insuficiente; sem inferência por tamanho do enunciado' };
  topic.lastPlanned = latestPlanExposure(state, topic.id);
  delete topic._families;
  delete topic._difficulty;
  delete topic.weightedSuccess;
 }

 return { state, subjects: topics, seen, questions, model: MODEL, day: today };
}

export function selectQuestions(content, events, subjectId, limit = 5, now = new Date()) {
 const maxQuestions = Math.max(0, Math.floor(Number(limit) || 0));
 if (!maxQuestions) return [];
 const diagnosis = diagnose(content, events, now);
 const eligibleSubjects = new Set(diagnosis.subjects.map(topic => topic.id));
 const candidates = [];
 for (const question of content.questions) {
  if ((subjectId && question.assunto_id !== subjectId) || !eligibleSubjects.has(question.assunto_id)) continue;
  const family = familyOf(question), previous = diagnosis.seen.get(family);
  if (previous && daysBetween(previous.at, now) < 7) continue;
  candidates.push(question);
 }
 candidates.sort((a, b) => {
   const previousA = diagnosis.seen.get(familyOf(a)), previousB = diagnosis.seen.get(familyOf(b));
   const reviewA = previousA ? Number(!previousA.correct) + Number(previousA.confidence === 'inseguro') : -1;
   const reviewB = previousB ? Number(!previousB.correct) + Number(previousB.confidence === 'inseguro') : -1;
   const difficultyOrder = { facil: 0, media: 1, dificil: 2 };
   return Number(!!previousA) - Number(!!previousB)
    || reviewB - reviewA
    || (Number(b.versao) || 0) - (Number(a.versao) || 0)
    || (difficultyOrder[a.dificuldade] ?? 1) - (difficultyOrder[b.dificuldade] ?? 1)
    || String(a.id).localeCompare(String(b.id));
  });
 const families = new Set(), selected = [];
 for (const question of candidates) {
  const family = familyOf(question);
  if (families.has(family)) continue;
  families.add(family);
  selected.push(question);
  if (selected.length >= maxQuestions) break;
 }
 return selected.map(question => question.id);
}

export function theoryForSubject(content, subjectId) {
 const indexed = (content.theory || [])
  .filter(item => item.assunto_id === subjectId && item.documento_id && item.pagina_inicio)
  .sort((a, b) => {
   const qualityA = a.metodo === 'conferencia_editorial' ? 0 : 1;
   const qualityB = b.metodo === 'conferencia_editorial' ? 0 : 1;
   return qualityA - qualityB || (a.pagina_fim - a.pagina_inicio) - (b.pagina_fim - b.pagina_inicio);
  });
 if (indexed.length) return indexed[0];
 const subject = content.subjects.find(item => item.id === subjectId);
 const documents = new Map(content.documents.map(item => [item.id, item]));
 const mappedSections = (content.sections || []).flatMap(section => {
  const document = documents.get(section.documento_id);
  if (!subject || !document || document.tipo !== 'teoria' || document.canonica === false || document.disciplina_id !== subject.disciplina_id) return [];
  const topic = normalized(subject.nome), heading = normalized(section.titulo);
  const topicWords = [...new Set(topic.split(' ').filter(word => word.length > 2))];
  const headingWords = [...new Set(heading.split(' ').filter(word => word.length > 2))];
  if (!topic || !heading || !topicWords.length || !headingWords.length || ['sumario', 'indice', 'gabarito'].includes(heading)) return [];
  const shared = new Set(topicWords.filter(word => headingWords.includes(word)));
  const exact = topic === heading;
  if (!exact && (shared.size < 2 || shared.size / Math.min(topicWords.length, headingWords.length) < 0.8)) return [];
  return [{ ...section, metodo: exact ? 'titulo_exato_sumario_pdf' : 'titulo_correspondente_sumario_pdf', _match: exact ? 2 : 1 }];
 });
 const candidates = mappedSections.sort((a, b) => (
  (b._match || 0) - (a._match || 0)
  || (a.pagina_fim - a.pagina_inicio) - (b.pagina_fim - b.pagina_inicio)
  || a.pagina_inicio - b.pagina_inicio
 ));
 return candidates[0] || null;
}

function addTask(tasks, remaining, task) {
 if (task.minutes > remaining) return remaining;
 tasks.push(task);
 return remaining - task.minutes;
}

export function makePlan(content, events, now = new Date(), options = {}) {
 const diagnosis = diagnose(content, events, now), day = dayKey(now), state = diagnosis.state;
 const signature = JSON.stringify([state.settings.days,state.settings.minutes,state.settings.startTime]);
 const previous = state.plans[day];
 if (previous?.model === MODEL && previous.scheduleSignature === signature) return previous;
 const tasks = (previous?.tasks || []).filter(t => ['started','done'].includes(state.tasks[t.id]?.status));
 const capacity = state.settings.minutes;
 let remaining = Math.max(0,capacity-tasks.reduce((n,t)=>n+t.minutes,0));
 if (!state.settings.days.includes(now.getDay()) && !options.optional && !previous?.optional && !tasks.length)
  return {day,tasks:[],rest:true,model:MODEL,planned:0,capacity,scheduleSignature:signature};
 const topics = new Map(diagnosis.subjects.map(t=>[t.id,t]));
 const pools = new Map(), reserved = new Set();
 for (const task of tasks) for (const id of task.questionIds || []) reserved.add(familyOf(diagnosis.questions[id]||{id}));
 for (const q of content.questions) {
  if (!topics.has(q.assunto_id) || reserved.has(familyOf(q))) continue;
  const seen = diagnosis.seen.get(familyOf(q));
  if (seen && daysBetween(seen.at,now)<7) continue;
  if (!pools.has(q.assunto_id)) pools.set(q.assunto_id,[]);
  pools.get(q.assunto_id).push(q);
 }
 const served = new Map();
 for(const plan of Object.values(state.plans)) {
  if(plan.day>=day)continue;
  for(const t of plan.tasks||[]) {
   const d=topics.get(t.subjectId)?.disciplineId;
   if(d)served.set(d,(served.get(d)||0)+t.minutes);
  }
 }
 for(const t of tasks){const d=topics.get(t.subjectId)?.disciplineId;if(d)served.set(d,(served.get(d)||0)+t.minutes);}
 const chosen = new Set(tasks.map(t=>topics.get(t.subjectId)?.disciplineId));
 const candidates = diagnosis.subjects.filter(t=>pools.get(t.id)?.length);
 const disciplineIds=[...new Set(candidates.map(t=>t.disciplineId))];
 const weights=new Map(disciplineIds.map(id=>[id,candidates.find(t=>t.disciplineId===id).historicalPriority || .05]));
 const weightTotal=[...weights.values()].reduce((a,b)=>a+b,0);
 const sections = new Map();
 let slot=tasks.length;
 while(remaining>=10 && candidates.length) {
  const total=[...served.values()].reduce((a,b)=>a+b,0)+40;
  const available=disciplineIds.filter(id=>candidates.some(t=>t.disciplineId===id&&pools.get(t.id)?.length));
  if(!available.length)break;
  const freshDisc=available.filter(id=>!chosen.has(id));
  const choices=freshDisc.length?freshDisc:available;
  choices.sort((a,b)=>(total*weights.get(b)/weightTotal-(served.get(b)||0))-(total*weights.get(a)/weightTotal-(served.get(a)||0)) || a.localeCompare(b));
  const discipline=choices[0];
  const ranked=candidates.filter(t=>t.disciplineId===discipline&&pools.get(t.id)?.length).sort((a,b)=>(slot%3!==2 ? Number(pools.get(b.id).some(q=>!diagnosis.seen.has(familyOf(q))))-Number(pools.get(a.id).some(q=>!diagnosis.seen.has(familyOf(q)))) : 0)||Number(tasks.some(t=>t.subjectId===a.id))-Number(tasks.some(t=>t.subjectId===b.id))||b.priority-a.priority||b.costBenefit-a.costBenefit||a.id.localeCompare(b.id));
  const topic=ranked[0];
  let pool=pools.get(topic.id).filter(q=>!reserved.has(familyOf(q)));
  if(!pool.length){pools.set(topic.id,[]);continue;}
  pool.sort((a,b)=>Number(diagnosis.seen.has(familyOf(a)))-Number(diagnosis.seen.has(familyOf(b)))||a.id.localeCompare(b.id));
  if(!sections.has(topic.id))sections.set(topic.id,theoryForSubject(content,topic.id));
  const section=sections.get(topic.id);
  const blockBudget=Math.min(40,remaining);
  const needsTheory=section && !tasks.some(t=>t.kind==='theory'&&t.subjectId===topic.id) && (topic.uniqueEvidence<3||topic.estimate<.5||topic.recurrentErrors>=2) && blockBudget>=30;
  const theoryMinutes=needsTheory?15:0;
  const count=Math.min(8,Math.floor((blockBudget-theoryMinutes)/4));
  const selected=[];
  for(const q of pool){if(reserved.has(familyOf(q)))continue;selected.push(q.id);reserved.add(familyOf(q));if(selected.length>=count)break;}
  if(!selected.length){pools.set(topic.id,[]);continue;}
  const reason=topic.reason+' Esta matéria entra para equilibrar o percurso com a distribuição histórica de pontos.';
  const base=day+'-'+topic.id+'-'+slot++;
  if(needsTheory){tasks.push({id:base+'-theory',kind:'theory',subjectId:topic.id,title:'Estudar um trecho direcionado',minutes:theoryMinutes,reason,section});remaining-=theoryMinutes;}
  const practiceMinutes=Math.min(remaining,Math.max(10,selected.length*4));
  tasks.push({id:base+'-practice',kind:'practice',subjectId:topic.id,title:topic.uniqueEvidence<3?'Conhecer seu ponto de partida':'Praticar e verificar a retenção',minutes:practiceMinutes,reason,questionIds:selected});
  remaining-=practiceMinutes;served.set(discipline,(served.get(discipline)||0)+theoryMinutes+practiceMinutes);chosen.add(discipline);
  pools.set(topic.id,pool.filter(q=>!reserved.has(familyOf(q))));
 }
 return {day,tasks,rest:false,optional:!!options.optional||!!previous?.optional,model:MODEL,scheduleSignature:signature,
 planned:tasks.reduce((n,t)=>n+t.minutes,0),capacity,stage:'percurso adaptativo de 90 dias',
 notice:remaining>=10?'Os itens elegíveis para hoje foram utilizados; a prática espaçada será retomada nos próximos dias.':null};
}
