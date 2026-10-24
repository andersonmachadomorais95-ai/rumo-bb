# Rumo BB

Aplicação privada de preparação para o concurso do Banco do Brasil.

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

`supabase/promote_quarantine.py` libera para prática apenas questões com ao menos duas alternativas e gabarito correspondente. As demais permanecem privadas. O comando atualiza o conteúdo da aplicação, verifica as contagens e solicita `service_role` com entrada oculta. As questões liberadas por esse fluxo continuam identificadas como pendentes de revisão editorial; os gabaritos ainda precisam ser conferidos nas fontes.
