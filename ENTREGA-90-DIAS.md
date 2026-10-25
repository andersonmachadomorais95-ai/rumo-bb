# Percurso de 90 dias — motor bb-3.1

O plano segue os dias e minutos escolhidos, com horário preferido informativo. Em dias livres, o botão de estudo opcional cria tarefas sem alterar a semana. Não há expiração no 90º dia nem data de prova presumida.

## Questões prontas

5.024 itens elegíveis, com enunciados, alternativas e gabarito correspondente preparados para resposta dentro da aplicação. 976 itens não participam das tarefas. Dos elegíveis, 5.002 permanecem sem revisão editorial integral: preparo estrutural não é conferência completa do conteúdo.

| Matéria | Questões |
|---|---:|
| Língua Portuguesa |515|
| Língua Inglesa |214|
| Matemática |193|
| Matemática Financeira |240|
| Atualidades do Mercado Financeiro |334|
| Conhecimentos Bancários |1734|
| Informática |1296|
| Vendas e Negociação |498|

O item f70a9b92-1054-5ec2-bf36-839cc913339b foi isolado porque a versão 1 estava com gabarito A no banco publicado e E no pacote local. Nenhum desses gabaritos foi silenciosamente adotado como correto para novas respostas. Eventos anteriores não foram apagados.

## Planejamento

Distribuição primeiro por matéria, usando déficit de minutos em relação aos pontos históricos; depois, desempenho, revisão e cobertura por assunto. Tarefas contêm IDs de questões existentes, elegíveis e sem duplicar famílias no mesmo dia. Novidade e revisão têm espaço; itens vistos com consulta não são reclassificados como inéditos.

Planos já gerados permanecem estáveis após respostas. Alterações explícitas na rotina ou no modelo preservam tarefas iniciadas/concluídas e recalculam as demais. Se tarefas já comprometidas excederem uma redução de disponibilidade, elas são preservadas e não se acrescenta mais tempo.

## Verificações

28 testes Node e 15 testes Python passaram com dados separados. Simulação do catálogo real durante 90 dias corridos, cinco dias por semana, três trajetórias de desempenho: 65 dias de estudo, oito matérias contempladas, zero dias de estudo vazios, 1119–1306 respostas, 915–1085 famílias novas, média próxima de 117 minutos planejados. Resultados em tests/simulacao-90-dias.jsonl. Não são previsão de resultados do aluno.

O estudo diário não depende de geração de questões, de IA ou do Gran. Requer internet e disponibilidade do Supabase/Vercel. O banco é finito; revisão editorial e confirmação normativa permanecem necessárias para os itens sinalizados. O modelo não promete aprovação nem cobertura integral de todos os microassuntos em 90 dias.

## Sincronização confirmada

5.024 questões ativas, IDs conferidos contra o catálogo; 126 PDFs verificados no bucket privado. Snapshot prévio em `%LOCALAPPDATA%/RumoBB/content-backups`. Questões retiradas foram arquivadas na própria tabela; eventos de alunos não foram alterados. A credencial temporária de importação foi removida.
