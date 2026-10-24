export const MODEL='bb-1.0';
export const DEFAULTS={name:'Luciano',minutes:120,days:[1,2,3,4,5]};
export const dayKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const daysBetween=(a,b)=>(Date.parse(b)-Date.parse(a))/86400000;
export function reduce(events){
 const s={settings:{...DEFAULTS},attempts:[],plans:{},tasks:{},sessions:{},closed:{},reading:{}};
 for(const e of events){const p=e.payload;
  if(e.type==='settings')s.settings={...s.settings,...p};
  if(e.type==='answer')s.attempts.push({...p,at:e.at,id:e.id});
  if(e.type==='plan'&&!s.plans[p.day])s.plans[p.day]=p;
  if(e.type==='task')s.tasks[p.taskId]=p;
  if(e.type==='session')s.sessions[p.id]=p;
  if(e.type==='close')s.closed[p.day]=true;
  if(e.type==='reading')s.reading[p.documentId]=p;
 }return s;
}
export function diagnose(content,events,now=new Date()){
 const state=reduce(events),by={};
 for(const a of content.subjects)by[a.id]={id:a.id,name:a.nome,disciplineId:a.disciplina_id,n:0,correct:0,newN:0,newCorrect:0,errors:0,insecure:0,retentionN:0,retentionCorrect:0,last:null,weight:0,success:0};
 const questions=Object.fromEntries(content.questions.map(q=>[q.id,q])),seen=new Map();
 for(const a of state.attempts){const q=questions[a.questionId];if(!q)continue;const d=by[q.assunto_id];if(!d)continue;
  const prev=seen.get(q.familia_id);const spaced=prev&&daysBetween(prev.at,a.at)>=7;const fresh=!prev;
  d.n++;d.correct+=a.correct?1:0;d.errors+=a.correct?0:1;d.insecure+=a.confidence==='inseguro'?1:0;d.last=a.at;
  if(fresh&&!a.consulted&&!a.recognized){d.newN++;d.newCorrect+=a.correct?1:0;}
  let w=a.consulted||a.recognized?0:fresh?1:spaced?0.5:0;
  if(a.confidence==='inseguro')w*=0.65;
  d.weight+=w;d.success+=w*(a.correct?1:0);
  if(spaced&&!a.consulted&&!a.recognized){d.retentionN++;d.retentionCorrect+=a.correct?1:0;}
  seen.set(q.familia_id,a);
 }
 const today=now.toISOString();
 for(const d of Object.values(by)){
  d.estimate=(d.success+2)/(d.weight+4);d.confidence=d.weight<8?'inicial':d.weight<20?'em formação':'mais consistente';
  d.level=d.weight<5?'Conhecendo seu desempenho':d.estimate<0.55?'Construir a base':d.estimate>=0.8&&d.newN>=20&&d.retentionN>=3?'Manutenção':'Em desenvolvimento';
  d.reviewUrgency=!d.last?0:Math.min(1,daysBetween(d.last,today)/(d.estimate>=0.75?14:7));
  const disc=content.disciplines.find(x=>x.id===d.disciplineId);d.historical=disc?.weight??1;
  d.priority=d.historical*(0.25+(1-d.estimate)*0.35+d.reviewUrgency*0.25+(d.newN<5?0.15:0));
  d.available=content.questions.filter(q=>q.assunto_id===d.id).length;
  d.newAvailable=content.questions.filter(q=>q.assunto_id===d.id&&!seen.has(q.familia_id)).length;
  d.reason=!d.n?'Vamos conhecer este assunto com uma leitura curta e algumas questões.':d.reviewUrgency>=0.8?'Você já estudou este tema; agora vamos verificar o que ficou depois de alguns dias.':d.estimate<0.55?'Os últimos resultados sugerem retomar a explicação antes de tentar novas questões.':d.newN<8?'Ainda precisamos de mais questões novas para entender seu desempenho.':'Vamos manter o conteúdo em dia e conferir o aprendizado em novas questões.';
 }
 return {state,subjects:Object.values(by),seen,questions};
}
export function selectQuestions(content,events,subjectId,limit=5,now=new Date()){
 const d=diagnose(content,events,now);
 return content.questions.filter(q=>!subjectId||q.assunto_id===subjectId).filter(q=>{const prev=d.seen.get(q.familia_id);return !prev||daysBetween(prev.at,now.toISOString())>=2;})
 .sort((a,b)=>{const pa=d.seen.get(a.familia_id),pb=d.seen.get(b.familia_id);return Number(!!pa)-Number(!!pb)||(pa?.correct?1:0)-(pb?.correct?1:0)||a.id.localeCompare(b.id);})
 .filter((q,i,arr)=>arr.findIndex(x=>x.familia_id===q.familia_id)===i).slice(0,limit).map(q=>q.id);
}
export function makePlan(content,events,now=new Date()){
 const d=diagnose(content,events,now),day=dayKey(now);if(d.state.plans[day])return d.state.plans[day];
 if(!d.state.settings.days.includes(now.getDay()))return {day,tasks:[],rest:true,model:MODEL};
 const candidates=d.subjects.filter(s=>s.available).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
 const tasks=[];let remaining=d.state.settings.minutes;
 // Cobertura explícita: segundo assunto pelo menor número de evidências, não apenas prioridade.
 const chosen=candidates.length?[candidates[0],candidates.filter(s=>s.id!==candidates[0].id).sort((a,b)=>a.newN-b.newN||b.priority-a.priority)[0]].filter(Boolean):[];
 for(const s of chosen){
  const section=content.theory.find(t=>t.assunto_id===s.id);
  if(section&&remaining>=15){const minutes=Math.min(s.weight<5||s.estimate<0.55?25:15,remaining);tasks.push({id:`${day}-${s.id}-theory`,kind:'theory',subjectId:s.id,title:'Entender antes de praticar',minutes,reason:s.reason,section});remaining-=minutes;}
  const ids=selectQuestions(content,events,s.id,5,now);if(ids.length&&remaining>=10){const minutes=Math.min(20,remaining);tasks.push({id:`${day}-${s.id}-practice`,kind:'practice',subjectId:s.id,title:s.reviewUrgency>=0.8?'Revisar com questões':'Praticar com atenção',minutes,reason:s.reason,questionIds:ids});remaining-=minutes;}
 }
 // Não preenche tempo artificialmente quando o banco disponível não cobre o plano.
 return {day,tasks,rest:false,model:MODEL,planned:tasks.reduce((n,t)=>n+t.minutes,0),capacity:d.state.settings.minutes,notice:remaining>0?'O plano usa apenas conteúdo liberado. Você pode consultar outras matérias na biblioteca; o tempo restante não vira dívida para amanhã.':null};
}
