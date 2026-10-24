-- Pending questions are private and are not exposed by any application RPC.
create table if not exists public.bb_quarantine (
 id uuid primary key,
 payload jsonb not null
);
alter table public.bb_quarantine enable row level security;
revoke all on public.bb_quarantine from public,anon,authenticated;
grant all on public.bb_quarantine to service_role;
