# Rumo BB

Aplicação privada de preparação para o concurso do Banco do Brasil.

## Perfil da banca

A rota **Perfil da banca** apresenta dados de `web/banca.mjs`, consolidados a partir do relatório editorial e da classificação item a item das provas de 2018, 2021 e 2023. Para Agente Comercial, a incidência usa somente os cadernos B/1 de 2021 e A/1 de 2023; o caderno de 2018 fica separado por ter outra composição. A classificação não é oficial e frequências passadas não são previsões. As regras do cargo e da seleção são identificadas como históricas e devem ser confirmadas em um novo edital.

## Deploy

- O frontend é estático e fica em `web/`. Configure `web` como Root Directory no Vercel; não é necessário comando de build.
- `web/config.js` contém apenas a URL do projeto Supabase e uma chave publicável/anon. Nunca coloque uma chave `service_role` neste arquivo, no repositório ou no Vercel.
- As questões, documentos e histórico permanecem no Supabase. O acesso é validado por Auth e pela tabela privada `bb_members`.
- O bucket `bb-content` deve permanecer privado. O site pede URLs assinadas para os documentos após autenticação.
- O repositório do GitHub deve ser privado; não adicione o acervo `Gran Banco do Brasil` ao repositório.

## Conteúdo em quarentena

Somente questões com status `liberada` entram em `bb_questions` e são oferecidas para prática. Questões pendentes podem ser preservadas em `bb_quarantine`, tabela sem acesso para `anon` e `authenticated`, sem RPC que a exponha.

Depois de aplicar `supabase/002_quarantine.sql` no SQL Editor, a importação privada é repetível:

```powershell
python .\supabase\upload_quarantine.py https://<project-ref>.supabase.co --dry-run
python .\supabase\upload_quarantine.py https://<project-ref>.supabase.co
```

O segundo comando solicita `service_role` com entrada oculta. Não compartilhe essa chave. Para uso da aplicação no navegador, use somente uma chave publicável/anon.

`supabase/promote_quarantine.py` libera para prática apenas questões com ao menos duas alternativas, gabarito correspondente e sem conflitos de resposta ou referências a elementos visuais/contextuais ausentes. Registros com `extracao_automatica_pendente` também ficam bloqueados: uma extração estruturada não substitui a conferência editorial na fonte. As demais pendências permanecem privadas. O comando sincroniza a quarentena, atualiza o conteúdo da aplicação, remove do banco questões que deixaram de ser elegíveis e verifica as contagens. Ele solicita `service_role` com entrada oculta. As questões liberadas por esse fluxo continuam identificadas como pendentes de revisão editorial; os gabaritos ainda precisam ser conferidos nas fontes.

## Mentoria adaptativa

O motor local `web/engine.mjs` é a única fonte para o diagnóstico usado em Hoje, Praticar, Revisar e Evolução. O modelo não chama serviços de IA e só considera dados que a aplicação realmente coleta. O treino, os materiais, as respostas, as tarefas e o histórico ficam dentro da aplicação; não existe registro de questões respondidas em outra plataforma. Registros externos antigos, se existirem em um backup, são preservados como histórico bruto, mas não entram no diagnóstico nem no planejamento.

### O que significa cada indicador

- **Prioridade histórica:** combina cobertura de pontos e incidência por matéria do recorte histórico comercial de 2021/2023. O recorte tem dois cadernos e 140 itens; não há incidência validada para cada microassunto. Essa referência não prevê a próxima prova.
- **Domínio estimado:** média suavizada com prior Beta(2, 2): `(2 + acertos ponderados) / (4 + evidência ponderada)`. O percentual só é mostrado com pelo menos cinco famílias independentes; com menos evidência, a interface diz que ainda está conhecendo o desempenho.
- **Urgência de revisão:** dias desde a última evidência local válida divididos pelo intervalo de referência, limitado a 1. A referência é 3 dias após erros recentes ou estimativa abaixo de 50%, 7 dias em desenvolvimento e 21 dias quando a estimativa é ao menos 75%.
- **Confiança no diagnóstico:** inicial com menos de 5 famílias independentes; em formação com menos de 10 ou menos de 2 verificações espaçadas; consistente com ao menos 20 famílias e 4 verificações espaçadas; moderada nos demais casos. É qualidade da evidência, não confiança declarada na resposta.
- **Dificuldade:** usa somente classificações cadastradas na fonte, identificadas como estimativas. Não deduz dificuldade do tamanho ou do texto do enunciado.

### Evidências e limites

1. A primeira resposta a uma família de questão só contribui se não houve consulta nem reconhecimento do gabarito. Respostas inseguras recebem peso `0,65`; “não sei” recebe peso adicional `0,60`.
2. Uma tentativa imediata da mesma família não aumenta a estimativa. A repetição só conta como retenção após pelo menos 7 dias, com peso `0,70`. O peso de evidência diminui com meia-vida de 180 dias para refletir recência.
3. Ler material é atividade registrada, não evidência de aprendizagem. Tarefas não concluídas, dias sem acesso e domingo não são erros nem prova de desconhecimento.
4. Erros recorrentes são famílias diferentes cuja última evidência válida foi incorreta nos 30 dias anteriores. Um acerto posterior na mesma família remove esse erro recorrente.

Exemplo: quatro acertos novos seguros e dois erros novos inseguros, todos no mesmo dia, produzem peso `4 + 2 × 0,65 = 5,3` e estimativa suavizada `(2 + 4) / (4 + 5,3) ≈ 65%`. Isso ainda é um diagnóstico em formação, não uma previsão de nota. Uma repetição no mesmo dia não muda o cálculo; uma tentativa após sete dias pode acrescentar evidência de retenção.

### Priorização e roteiro diário

O escore de prioridade combina, sem substituir os quatro indicadores exibidos, peso histórico da matéria, lacuna estimada, urgência, cobertura de questões novas e erros recorrentes:

```text
prioridade =
  0,35 × participação histórica nos pontos
  + 0,20 × (1 − estimativa de domínio)
  + 0,20 × urgência de revisão
  + 0,15 × lacuna de cobertura [max(0, 1 − questões novas / 8)]
  + 0,10 × erros recorrentes [min(erros / 3, 1)]
```

O custo-benefício é um índice relativo, não uma promessa de ganho: valor esperado (lacuna `0,35`, urgência `0,25`, incerteza `0,20`, cobertura `0,20`) multiplicado por `participação histórica + 0,05` e dividido pelo tempo estimado da próxima atividade. A incerteza usa aproximação `1,96 × √(p × (1 − p) / (4 + peso da evidência))`. Esses coeficientes são regras pedagógicas iniciais, não parâmetros cientificamente calibrados.

O plano tem no máximo 120 minutos, nos dias escolhidos pelo aluno (inclusive domingo, se escolhido). O padrão inicial é segunda a sexta. O horizonte informado é de 90 dias corridos, não uma garantia de cobertura ou de questões inéditas em todos os assuntos. Nos primeiros dias, distribui pequenos blocos de teoria direcionada e prática local por mais de um assunto. Depois, inclui revisão espaçada quando vencida e preserva cobertura de assuntos ainda pouco vistos, em vez de repetir só os piores resultados. Todas as questões de prática são feitas e registradas dentro da aplicação. A teoria usa páginas mapeadas para cada assunto; quando ainda não há correspondência confirmada, o app informa isso em vez de indicar uma página possivelmente errada.

### Biblioteca, provas e páginas dos assuntos

- Os guias do estudante são apresentados com nomes curtos (`Semana-1` a `Semana-12`), mantendo os PDFs privados e sem alterar os objetos armazenados.
- A aba **Provas e gabaritos** agrupa caderno e gabarito pela seleção/ano, destacando quando existe versão atualizada.
- Para incluir novos PDFs de matéria, execute `python .\scripts\preparar.py` a partir de `Gran Banco do Brasil\pacote-conteudo-v1`; o catálogo gera títulos de exibição legíveis, mantém a disciplina e copia os arquivos para o armazenamento privado do pacote sem alterar os originais.
- O extrator `Gran Banco do Brasil\preparacao-supabase\preparar_materiais_novos.py` transcreve questões existentes nos PDFs locais de Matemática e Língua Inglesa e registra suas páginas, gabaritos e comentários. A extração é automática: os 851 itens novos permanecem em quarentena com `extracao_automatica_pendente` até conferência editorial; cinco duplicatas exatas foram associadas a registros já existentes. O recortador só altera páginas quando reconhece com segurança o template; neste lote não recortou nenhum PDF para evitar falsos positivos em tabelas e páginas de contracapa.
- Em seguida, execute `python .\supabase\map_theory_pages.py` na raiz do repositório, com o pacote local e `pymupdf` disponíveis. O índice procura correspondência textual e títulos de capítulos na disciplina correta, ignora páginas de sumário e preserva os trechos já conferidos editorialmente. As correspondências geradas ficam em `supabase/theory_page_map.json` (somente IDs, páginas e títulos; nenhum PDF é copiado ao repositório).
- O mapa automático atual encontra correspondência para 503 dos 762 assuntos; somado aos 10 trechos revisados editorialmente, o conteúdo servido inclui 513 assuntos mapeados. Em uma questão errada, a correção oferece o PDF e a página mapeada; para assuntos sem uma página confiável, indica explicitamente que o vínculo ainda não está disponível. Atualize o conteúdo do Supabase com o fluxo administrativo existente após regenerar o índice.

Após regenerar o mapa, valide e publique o conteúdo no Supabase:

```powershell
python .\supabase\upload.py https://<project-ref>.supabase.co --dry-run
python .\supabase\upload.py https://<project-ref>.supabase.co
```

O importador envia as questões ativas em lotes de 50 e armazena os PDFs no bucket privado. Ele solicita a chave `service_role` com entrada oculta; nunca a coloque no repositório ou no navegador. Sincronize a quarentena e valide as contagens com `supabase/promote_quarantine.py` após o upload.

O plano do dia é persistido e não é reorganizado a cada resposta. Novas respostas atualizam o diagnóstico e influenciam o próximo plano diário. Na virada da data local, planos antigos sem fechamento recebem um registro automático de encerramento que preserva tarefas concluídas, em andamento e não iniciadas; nenhum estado é convertido em acerto ou erro, nem pendências são empilhadas como dívida no dia seguinte. A data considera o fuso local do navegador, inclusive após meia-noite ou dias sem acesso.

As escolhas de dias são preservadas inclusive em registros antigos. Não há migração automática de cinco para seis dias. O horário preferido é configurável e informativo, sem notificações ou bloqueio de acesso. O tempo disponível é limitado a 120 minutos por dia; alterações na rotina só afetam planos futuros.


## Atualização bb-3.1 — percurso de 90 dias

A distribuição agora é feita primeiro por matéria: déficit entre tempo planejado acumulado e participação histórica de pontos. Dentro da matéria, o diagnóstico seleciona assunto executável com questões já cadastradas. Duas de cada três vagas priorizam assuntos com famílias inéditas, quando disponíveis; a outra permite manutenção e erros. Isso é uma regra pedagógica, não probabilidade de cobrança.

Blocos de até 40 minutos combinam teoria de 15 minutos, quando há trecho mapeado e lacuna, e prática estimada em quatro minutos por questão. O motor usa o tempo escolhido até 120 minutos e preserva tarefas iniciadas/concluídas em uma mudança de rotina/modelo. O tempo registrado continua separado. Questões já vistas com consulta não passam a inéditas na primeira resposta qualificada.

No dia livre, Hoje oferece “Quero estudar hoje” sem mudar os dias da rotina. Horizonte: 90 dias corridos; o aplicativo não expira depois disso. O banco é finito e não há garantia de questões inéditas em todos os microassuntos indefinidamente.

Teste com o catálogo real, três trajetórias (80% de acertos, todos errados e todos certos), 90 dias, segunda a sexta: 65 dias de estudo, oito matérias contempladas, nenhum dia de estudo vazio, 1119–1306 respostas e 915–1085 famílias novas; cerca de 117 minutos planejados/dia. A simulação não prevê resultados do aluno e não comprova a correção editorial dos gabaritos. Script: `tests/simulate_90_days.mjs`, passando um JSON do conteúdo preparado como argumento.

A sincronização segura em `supabase/sync_safe.py` salva snapshot fora do repositório, interrompe em gabarito divergente, prepara PDFs antes de ativar o catálogo e arquiva itens retirados sem apagar eventos. Não publique credenciais administrativas.
