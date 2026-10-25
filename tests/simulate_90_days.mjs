import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makePlan,diagnose} from '../web/engine.mjs';
const content=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const qs=new Map(content.questions.map(q=>[q.id,q])),subjects=new Map(content.subjects.map(s=>[s.id,s]));
for(const mode of ['mixed','wrong','correct']){
 const events=[],seen=new Set(),r={mode,days:0,answers:0,newFamilies:0,minutes:0,empty:0,byDiscipline:{}};
 for(let i=0;i<90;i++){
  const date=new Date(2026,9,26+i,12),p=makePlan(content,events,date);
  if(p.rest)continue;r.days++;r.minutes+=p.planned;if(!p.tasks.length)r.empty++;
  assert.ok(p.planned<=120);events.push({type:'plan',payload:p});
  for(const t of p.tasks)for(const id of t.questionIds||[]){const q=qs.get(id);assert.ok(q);const family=q.familia_id||id;r.answers++;if(!seen.has(family)){r.newFamilies++;seen.add(family);}const disc=subjects.get(q.assunto_id).disciplina_id;r.byDiscipline[disc]=(r.byDiscipline[disc]||0)+1;events.push({type:'answer',at:date.toISOString(),payload:{questionId:id,familyId:family,correct:mode==='correct'||mode==='mixed'&&r.answers%5!==0,answer:'A',consulted:false,recognized:false,confidence:'seguro'}});}
 }
 console.log(JSON.stringify(r));
 assert.equal(Object.keys(r.byDiscipline).length,8);assert.equal(r.empty,0);assert.ok(r.newFamilies>500);assert.ok(r.minutes/r.days>=100);
 r.byDiscipline=Object.fromEntries(Object.entries(r.byDiscipline).map(([id,n])=>[content.disciplines.find(d=>d.id===id).nome,n]));
 console.log(JSON.stringify(r));
}
