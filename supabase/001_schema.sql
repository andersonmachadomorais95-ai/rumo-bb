-- Executar uma vez no SQL Editor do projeto. Não contém credenciais.
create table if not exists public.bb_content (id text primary key, payload jsonb not null);
create table if not exists public.bb_questions (id uuid primary key, payload jsonb not null, correction jsonb not null);
create table if not exists public.bb_events (
 user_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null,
 seq bigint generated always as identity,
 body jsonb not null,
 primary key(user_id,id)
);
create unique index if not exists bb_answer_slot on public.bb_events(user_id,(body->'payload'->>'sessionId'),(body->'payload'->>'index')) where body->>'type'='answer';
create table if not exists public.bb_imports(user_id uuid references auth.users(id) on delete cascade, hash text, primary key(user_id,hash));
create table if not exists public.bb_restore_backups(id bigint generated always as identity primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz not null default now(),payload jsonb not null);
create table if not exists public.bb_members(user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.bb_members enable row level security;
revoke all on public.bb_members from anon,authenticated;
create or replace function public.bb_is_member() returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from bb_members where user_id=auth.uid()) $$;
revoke all on function public.bb_is_member() from public,anon;
grant execute on function public.bb_is_member() to authenticated;
alter table public.bb_content enable row level security;
alter table public.bb_questions enable row level security;
alter table public.bb_events enable row level security;
alter table public.bb_imports enable row level security;
alter table public.bb_restore_backups enable row level security;
-- Sem acesso direto a tabelas: RPCs autenticadas são a fronteira da aplicação.
revoke all on public.bb_content,public.bb_questions,public.bb_events,public.bb_imports,public.bb_restore_backups from anon,authenticated;

create or replace function public.bb_event(event_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); e jsonb:=event_input; p jsonb; t text; q public.bb_questions; result jsonb;
begin
 if u is null or not bb_is_member() then raise exception 'Conta sem acesso autorizado'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if octet_length(e::text)>100000 then raise exception 'Registro muito grande'; end if;
 perform (e->>'id')::uuid; perform (e->>'at')::timestamptz;
 if exists(select 1 from bb_events where user_id=u and id=(e->>'id')::uuid) then
  return jsonb_build_object('events',coalesce((select jsonb_agg(body order by seq) from bb_events where user_id=u),'[]'::jsonb));
 end if;
 t:=e->>'type';p:=e->'payload';
 if t not in ('settings','plan','task','session','answer','close','reading') or jsonb_typeof(p)<>'object' then raise exception 'Evento inválido'; end if;
 if t='settings' then
  if length(trim(p->>'name')) not between 1 and 60 or (p->>'minutes')::int not between 15 and 240 or jsonb_typeof(p->'days')<>'array' or jsonb_array_length(p->'days')=0 then raise exception 'Rotina inválida'; end if;
  if exists(select 1 from jsonb_array_elements_text(p->'days') d where d::int not between 0 and 6) then raise exception 'Dias inválidos';end if;
 end if;
 if t='task' and (p->>'status' not in ('started','done') or coalesce((p->>'minutes')::numeric,0) not between 0 and 240) then raise exception 'Tarefa inválida';end if;
 if t='plan' and (select coalesce(sum((v->>'minutes')::numeric),0) from jsonb_array_elements(p->'tasks') v)>240 then raise exception 'Plano inválido';end if;
 if t='answer' then
  select * into q from bb_questions where id=(p->>'questionId')::uuid and payload->>'status'='liberada';
  if not found then raise exception 'Questão indisponível; resposta não pontuada';end if;
  if p->>'confidence' not in ('seguro','inseguro') or jsonb_typeof(p->'consulted')<>'boolean' or jsonb_typeof(p->'recognized')<>'boolean' then raise exception 'Condições da resposta inválidas';end if;
  if p->>'answer' is not null and not exists(select 1 from bb_content c,jsonb_array_elements(c.payload->'alternatives') a where c.id='bootstrap' and a->>'questao_id'=q.id::text and a->>'letra'=p->>'answer') then raise exception 'Alternativa inválida';end if;
  p:=p||jsonb_build_object('correct',coalesce(p->>'answer'=q.correction->>'answer',false),'version',q.payload->'versao','familyId',q.payload->'familia_id','correction',q.correction);
  e:=jsonb_set(e,'{payload}',p);
 end if;
 insert into bb_events(user_id,id,body) values(u,(e->>'id')::uuid,e);
 select coalesce(jsonb_agg(body order by seq),'[]'::jsonb) into result from bb_events where user_id=u;
 return jsonb_build_object('events',result);
end;$$;
create or replace function public.bb_bootstrap() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not bb_is_member() then raise exception 'Conta sem acesso autorizado';end if;
 return jsonb_build_object('content',(select payload from bb_content where id='bootstrap'),'events',coalesce((select jsonb_agg(body order by seq) from bb_events where user_id=auth.uid()),'[]'::jsonb));
end;$$;
create or replace function public.bb_export() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not bb_is_member() then raise exception 'Conta sem acesso autorizado';end if;
 return jsonb_build_object('format','rumo-bb-history','version',1,'content_version','1.0','model','bb-3.1','events',coalesce((select jsonb_agg(body order by seq) from bb_events where user_id=auth.uid()),'[]'::jsonb));
end;$$;
create or replace function public.bb_restore(backup jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();h text:=md5(backup::text); e jsonb;
begin
 if u is null or not bb_is_member() then raise exception 'Conta sem acesso autorizado';end if;
 if backup->>'format'<>'rumo-bb-history' or backup->>'version'<>'1' or jsonb_typeof(backup->'events')<>'array' or octet_length(backup::text)>10000000 then raise exception 'Backup inválido';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if exists(select 1 from bb_imports where user_id=u and hash=h) then return jsonb_build_object('ok',true,'repeated',true);end if;
 insert into bb_restore_backups(user_id,payload) values(u,bb_export());
 for e in select value from jsonb_array_elements(backup->'events') loop perform bb_event(e);end loop;
 insert into bb_imports values(u,h);
 delete from bb_restore_backups where user_id=u and id not in (select id from bb_restore_backups where user_id=u order by id desc limit 5);
 return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.bb_event(jsonb),public.bb_bootstrap(),public.bb_export(),public.bb_restore(jsonb) from public,anon;
grant execute on function public.bb_event(jsonb),public.bb_bootstrap(),public.bb_export(),public.bb_restore(jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit) values('bb-content','bb-content',false,50000000) on conflict(id) do nothing;
drop policy if exists bb_documents_read on storage.objects;
create policy bb_documents_read on storage.objects for select to authenticated using(bucket_id='bb-content' and public.bb_is_member());
-- Desative cadastro público em Authentication e crie somente os usuários autorizados.
