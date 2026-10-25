import { bancaProfile } from './banca.mjs';

export const MODEL = 'bb-2.1';
export const DEFAULTS = { name: 'Luciano', minutes: 120, days: [1, 2, 3, 4, 5], startTime: '19:00', horizonDays: 120, scheduleVersion: 3 };

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
    horizonDays: 120,
    scheduleVersion: 3,
   };
  }
  if (event.type === 'answer') state.attempts.push({ ...payload, at: event.at, id: event.id });
  if (event.type === 'plan' && (!state.plans[payload.day] || payload.model === MODEL && state.plans[payload.day].model !== MODEL)) state.plans[payload.day] = payload;
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

  if (fresh) {
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

export function makePlan(content, events, now = new Date()) {
 const diagnosis = diagnose(content, events, now), day = dayKey(now), state = diagnosis.state;
 if (state.plans[day]?.model === MODEL) return state.plans[day];
 if (!state.settings.days.includes(now.getDay())) {
  return { day, tasks: [], rest: true, model: MODEL, planned: 0, capacity: state.settings.minutes };
 }

 const scheduledCounts = new Map();
 for (const plan of Object.values(state.plans)) {
  if (plan.day >= day) continue;
  for (const subjectId of new Set((plan.tasks || []).map(task => task.subjectId).filter(Boolean))) {
   scheduledCounts.set(subjectId, (scheduledCounts.get(subjectId) || 0) + 1);
  }
 }
 const candidates = diagnosis.subjects
  .filter(topic => topic.available > 0 || theoryForSubject(content, topic.id))
  .sort((a, b) => {
   const dueA = a.reviewUrgency >= 0.65 ? 1 : 0, dueB = b.reviewUrgency >= 0.65 ? 1 : 0;
   return dueB - dueA || b.priority - a.priority || b.costBenefit - a.costBenefit || a.id.localeCompare(b.id);
  });
 const focus = [];
 const due = candidates.filter(topic => topic.reviewUrgency >= 0.65 && topic.uniqueEvidence > 0);
 if (due.length) focus.push(due[0]);
 const coverage = candidates.filter(topic => !focus.some(item => item.id === topic.id)).sort((a, b) => (
  (scheduledCounts.get(a.id) || 0) - (scheduledCounts.get(b.id) || 0)
  || a.newN - b.newN
  || b.priority - a.priority
  || b.costBenefit - a.costBenefit
  || a.id.localeCompare(b.id)
 ));
 if (coverage[0]) focus.push(coverage[0]);
 if (focus.length < 2) {
  const next = candidates.find(topic => !focus.some(item => item.id === topic.id));
  if (next) focus.push(next);
 }

 const tasks = [];
 let remaining = Math.min(120, state.settings.minutes);
 for (const [index, topic] of focus.entries()) {
  const section = theoryForSubject(content, topic.id);
  const questionIds = selectQuestions(content, events, topic.id, 5, now);
  const needTheory = !!section && (
   topic.uniqueEvidence < 3 || topic.recurrentErrors >= 2 || (topic.uniqueEvidence >= 3 && topic.estimate < 0.5)
  );
  const theoryMinutes = index === 0 ? 20 : 15;
  const practiceMinutes = index === 0 ? 20 : 15;
  if (needTheory && remaining >= 15) {
   remaining = addTask(tasks, remaining, {
    id: `${day}-${topic.id}-theory`,
    kind: 'theory',
    subjectId: topic.id,
    title: topic.uniqueEvidence < 3 ? 'Conhecer o assunto' : 'Retomar um ponto específico',
    minutes: theoryMinutes,
    reason: topic.reason,
    section,
    costBenefit: topic.costBenefit,
   });
  }
  if (questionIds.length && remaining >= 10) {
   const review = topic.reviewUrgency >= 0.65 && topic.uniqueEvidence > 0;
   remaining = addTask(tasks, remaining, {
    id: `${day}-${topic.id}-${review ? 'review' : 'practice'}`,
    kind: review ? 'review' : 'practice',
    subjectId: topic.id,
    title: review ? 'Revisar com questões espaçadas' : topic.uniqueEvidence < 3 ? 'Primeiro bloco curto' : 'Praticar e verificar',
    minutes: practiceMinutes,
    reason: !section && topic.uniqueEvidence < 3
     ? 'Ainda estamos conhecendo seu desempenho; comece com este bloco curto. Não há um trecho de PDF vinculado a este assunto no acervo atual.'
     : topic.reason,
    questionIds,
    costBenefit: topic.costBenefit,
   });
  }
 }

 const studyPlans = Object.keys(state.plans).filter(key => key < day && !state.plans[key].rest).length;
 return {
  day,
  tasks,
  rest: false,
  model: MODEL,
  planned: tasks.reduce((sum, task) => sum + task.minutes, 0),
  capacity: Math.min(120, state.settings.minutes),
  stage: diagnosis.subjects.reduce((sum, topic) => sum + topic.newN, 0) < 30 ? 'diagnóstico inicial gradual' : 'mentoria adaptativa',
  studyDayNumber: studyPlans + 1,
  notice: remaining >= 15
   ? 'O plano não ocupa todo o tempo disponível: não há conteúdo liberado ou evidência suficiente para justificar mais tarefas. O tempo restante não vira dívida.'
   : null,
 };
}
