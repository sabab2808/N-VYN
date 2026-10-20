create table public.budget_scenarios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'KRW' check (currency in ('KRW', 'EUR', 'BDT')),
  monthly_living numeric,
  annual_tuition numeric,
  annual_travel numeric,
  annual_fees numeric,
  annual_insurance numeric,
  guaranteed_monthly numeric,
  updated_at timestamptz not null default now()
);

alter table public.budget_scenarios enable row level security;
create policy budget_scenarios_owner_all on public.budget_scenarios for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.budget_scenarios to authenticated;

alter table public.documents
  add column if not exists availability_status text not null default 'needed'
    check (availability_status in ('available', 'needed', 'in_progress', 'booked_result_pending'));

alter table public.source_evidence
  add column if not exists content_snapshot text;

alter table public.source_changes
  add column if not exists old_content_snapshot text,
  add column if not exists new_content_snapshot text;

create index if not exists source_changes_pending_owner_idx
  on public.source_changes(user_id, detected_at desc)
  where review_status = 'pending';

create trigger budget_scenarios_updated_at
  before update on public.budget_scenarios
  for each row execute function public.set_updated_at();
