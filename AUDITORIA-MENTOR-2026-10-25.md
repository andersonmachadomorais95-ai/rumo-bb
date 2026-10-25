# Auditoria da publicação e do mentor — 25/10/2026

## Escopo e publicação

Frontend publicado em https://rumo-bb.vercel.app a partir do commit 4f72e13, confirmado visualmente em Hoje e Configurações. O código local anterior ainda não estava no Vercel. A tela anterior também mostrava descanso por ser domingo. Publicar no GitHub/Vercel não executa os scripts de importação do Supabase.

Verificação automatizada: 26 testes Node passaram; 15 testes Python passaram em diretórios temporários. Os testes existentes não eram suficientes para verificar equilíbrio de longo prazo. Nenhuma resposta de teste foi inserida na conta real. Configurações reais não foram alteradas pelo agente.

## Correções realizadas

- Referência inexistente `chooseTheory` substituída por `theoryForSubject`: assuntos sem questões podiam interromper a criação do plano.
- Removida migração que transformava escolhas antigas de cinco dias em seis dias.
- Domingo passou a ser uma opção explícita, respeitada pelo motor.
- Horário preferido configurável e visível, sem promessa de notificações.
- Contagem de famílias ainda não vistas agora considera exposição com consulta, além de respostas qualificadas.
- Seleção prioriza famílias novas antes de repetidas; repetidas aguardam sete dias para alinhar-se ao intervalo mínimo de retenção.
- Explicação do mentor aparece aberta na tela inicial.
- Horizonte de 120 dias corridos explicitado, sem garantia falsa de cobertura.

## Achados pendentes, em ordem de importância

### Alta: distribuição de longo prazo inadequada

Simulação determinística sobre o conteúdo local real, iniciada em 26/10/2026, por 120 dias corridos. Rotina padrão segunda a sexta, 120 minutos; respostas seguras sem consulta, quatro acertos a cada cinco; todos os blocos propostos respondidos; planos registrados em memória, sem tocar no banco real. Resultado:

- 86 dias de estudo;
- 132 respostas, 104 famílias novas;
- 3.530 minutos planejados, média aproximada de 41 minutos/dia;
- Vendas e Negociação: 104 respostas;
- Informática: 28 respostas;
- outras seis matérias: nenhuma questão proposta na simulação.

A simulação não prevê o comportamento de Luciano. É um teste de trajetória que demonstra uma falha possível e grave. A quantidade total de questões não resolve esse problema.

Causas identificadas no motor: seleciona só dois microassuntos; a primeira vaga tende a ficar com revisão vencida mesmo sem questões elegíveis; a segunda compara quantidade de agendamentos por microassunto, sem assegurar distribuição por matéria. A quantidade e a fragmentação dos microassuntos influenciam o percurso. Não há orçamento de tempo por disciplina nem reserva explícita de cobertura de todas as matérias.

Necessário: distribuir vagas/tempo primeiro por disciplina usando relevância histórica e déficits de cobertura; escolher assunto e atividade executável depois; não gastar vaga de revisão quando não há item elegível; testar trajetórias de acertos, erros e ausência de acesso durante 120 dias. Só então afirmar autonomia pedagógica.

### Alta: conteúdo online diferente do local

Observado na publicação autenticada: 5.067 disponíveis, 5.045 pendentes de revisão editorial, 83 isoladas (5.150 no total). Preparação local atual: 5.025 disponíveis, 5.003 pendentes de revisão editorial, 975 isoladas (6.000 no total). A revisão editorial integral permanece pendente para quase todo o banco de prática.

A publicação do frontend foi concluída; a atualização do conteúdo, dos novos PDFs e dos mapas no Supabase não foi executada nesta auditoria. Antes de importar: fazer backup consistente do conteúdo remoto, comparar IDs/versões/gabaritos, preservar histórico e arquivar itens retirados. O script atual `promote_quarantine.py` faz exclusões e não cria um snapshot remoto antes de alterar. Não foi executado.

### Alta: preservação de tarefas em atualização do modelo

`makePlan` reaproveita plano apenas se o modelo coincidir. Na troca de modelo, um plano existente pode ser substituído sem reaproveitar suas tarefas em andamento ou concluídas. Os eventos continuam armazenados, mas atividades podem sumir do roteiro visível. Criar reconciliação de planos que preserve tarefas iniciadas/concluídas antes de migrar modelo ou recalcular rotina.

### Média: revisão urgente e elegibilidade usam intervalos diferentes

Urgência aumenta após três dias em assuntos fracos; repetição só fica disponível após sete. Revisão pode ocupar uma vaga sem oferecer um item. Pode usar item novo equivalente, quando disponível; caso contrário deve oferecer teoria direcionada e reservar a vaga de prática para outro assunto.

### Média: métrica de questões novas após consulta

Uma família vista com consulta pode, ao ser respondida sem consulta após sete dias, entrar como primeira evidência qualificada e aumentar `newN`. Isso confunde questão nunca vista com primeira tentativa válida. Separar novidade de qualidade e classificar esse caso como retenção/transferência com exposição anterior.

### Média: duração e justificativa de ociosidade

O motor oferece no máximo dois assuntos com blocos fixos de 15/20 minutos. Mesmo com material abundante, tende a planejar bem menos que 120 minutos. A mensagem atribui isso à falta de conteúdo/evidência, o que não é necessariamente verdadeiro. Ajustar quantidade/duração ao tempo escolhido e distinguir diagnóstico inicial deliberadamente curto de limitação artificial do algoritmo.

### Média: alterações de rotina só valem para próximos planos

O formulário informa esse comportamento e o motor preserva o plano atual. Se o aluno reduzir o tempo ou desmarcar o dia após gerar o plano, ele não será reajustado naquele dia. Falta uma ação explícita de reorganizar somente tarefas não iniciadas, preservando o que já foi feito.

### Média: limites distintos no servidor e cliente

Frontend limita a 120 minutos; SQL aceita até 240 em configurações/tarefas/plano. O servidor deve validar a mesma regra e os campos obrigatórios explicitamente, inclusive valores ausentes, antes de considerar a fronteira de dados consistente. Nenhuma migração SQL foi aplicada nesta auditoria.

## Banco local por matéria

| Matéria | Questões | Famílias |
|---|---:|---:|
| Língua Inglesa |214|214|
| Vendas e Negociação |498|498|
| Língua Portuguesa |515|515|
| Matemática |193|193|
| Atualidades do Mercado Financeiro |334|334|
| Conhecimentos Bancários |1735|1735|
| Informática |1296|1292|
| Matemática Financeira |240|240|

São 5.021 famílias cadastradas; equivalência semântica não foi validada integralmente. Um horizonte de 120 dias com cinco dias semanais representa cerca de 85–86 dias de estudo. Dez questões novas por dia exigiriam cerca de 850–860 famílias no total; esse cálculo agregado não garante reserva proporcional por assunto, qualidade editorial ou distribuição correta.

## Limites da verificação

Não houve importação de conteúdo no Supabase, teste de gravação na conta real, validação editorial de milhares de itens nem teste de todos os PDFs online. A simulação utilizou o pacote local, que difere do remoto. O horário é preferência de início, não agendamento de notificações. A aplicação segue funcionando depois de 120 dias; não há data de prova inventada nem bloqueio ao final do horizonte.
