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

`supabase/promote_quarantine.py` libera para prática apenas questões com ao menos duas alternativas, gabarito correspondente e sem conflitos de resposta ou referências a elementos visuais/contextuais ausentes. As demais permanecem privadas. O comando sincroniza a quarentena, atualiza o conteúdo da aplicação, remove do banco questões que deixaram de ser elegíveis e verifica as contagens. Ele solicita `service_role` com entrada oculta. As questões liberadas por esse fluxo continuam identificadas como pendentes de revisão editorial; os gabaritos ainda precisam ser conferidos nas fontes.
