import test from 'node:test';
import assert from 'node:assert/strict';
import {bancaProfile} from '../web/banca.mjs';

const commercialSubjects=bancaProfile.subjects.filter(subject=>subject.group!=='Contexto 2018');

test('O edital comercial fecha 70 questões e 100 pontos nos dois grupos',()=>{
 assert.equal(commercialSubjects.reduce((total,subject)=>total+subject.questions,0),70);
 assert.equal(commercialSubjects.reduce((total,subject)=>total+subject.points,0),100);
 assert.equal(commercialSubjects.filter(subject=>subject.group==='Básicos').reduce((total,subject)=>total+subject.questions,0),25);
 assert.equal(commercialSubjects.filter(subject=>subject.group==='Básicos').reduce((total,subject)=>total+subject.points,0),32.5);
 assert.equal(commercialSubjects.filter(subject=>subject.group==='Específicos').reduce((total,subject)=>total+subject.questions,0),45);
 assert.equal(commercialSubjects.filter(subject=>subject.group==='Específicos').reduce((total,subject)=>total+subject.points,0),67.5);
});

test('As incidências por eixo correspondem aos quantitativos de cada caderno',()=>{
 for(const subject of commercialSubjects){
  assert.equal(subject.axes.reduce((total,axis)=>total+axis[1],0),subject.questions);
  assert.equal(subject.axes.reduce((total,axis)=>total+axis[2],0),subject.questions);
 }
 assert.equal(commercialSubjects.reduce((total,subject)=>total+subject.questions*2,0),bancaProfile.editionSummary.questions);
 assert.equal(bancaProfile.years.reduce((total,year)=>total+year.nonAnnulled,0),bancaProfile.editionSummary.nonAnnulled);
});

test('A prova de 2018 permanece fora do agregado comercial',()=>{
 const historical=commercialSubjects.find(subject=>subject.name==='Probabilidade e Estatística');
 assert.equal(historical,undefined);
 const context=bancaProfile.subjects.find(subject=>subject.group==='Contexto 2018');
 assert.equal(context.questions2018,20);
 assert.equal(context.questions,0);
});
