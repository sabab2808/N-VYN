create table public.scholarship_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_data jsonb not null
    check (jsonb_typeof(opportunity_data) = 'object')
    check (opportunity_data ->> 'id' = id::text),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

alter table public.scholarship_opportunities enable row level security;
create policy scholarship_opportunities_owner_all on public.scholarship_opportunities for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.scholarship_opportunities to authenticated;

create trigger scholarship_opportunities_updated_at
  before update on public.scholarship_opportunities
  for each row execute function public.set_updated_at();
