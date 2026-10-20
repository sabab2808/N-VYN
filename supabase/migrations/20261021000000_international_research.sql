alter table public.profiles
  add column if not exists portfolio_url text not null default '',
  add column if not exists github_url text not null default '',
  add column if not exists linkedin_url text not null default '',
  add column if not exists contact_email text not null default '',
  add column if not exists cv_url text not null default '',
  add column if not exists skills text not null default '',
  add column if not exists experience text not null default '';

alter table public.universities
  add column if not exists country text not null default 'South Korea',
  add column if not exists intake_label text not null default 'Fall 2027',
  add column if not exists deadline_note text,
  add column if not exists planning_tier text,
  add column if not exists research_notes text;

alter table public.universities
  add constraint universities_country_check
    check (country in ('South Korea', 'Germany', 'France'));

create index if not exists universities_country_owner_idx
  on public.universities(user_id, country, rank);

create table public.research_search_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  country text not null check (country in ('South Korea', 'Germany', 'France')),
  query_hash text not null,
  results jsonb not null,
  searched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, country, query_hash)
);

alter table public.research_search_cache enable row level security;

create table public.research_search_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count between 1 and 8)
);
alter table public.research_search_rate_limits enable row level security;

create or replace function public.claim_research_search_request(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed boolean;
begin
  insert into public.research_search_rate_limits (user_id, window_started_at, request_count)
  values (p_user_id, now(), 1)
  on conflict (user_id) do update
    set window_started_at = case
          when public.research_search_rate_limits.window_started_at <= now() - interval '1 minute' then now()
          else public.research_search_rate_limits.window_started_at
        end,
        request_count = case
          when public.research_search_rate_limits.window_started_at <= now() - interval '1 minute' then 1
          else public.research_search_rate_limits.request_count + 1
        end
    where public.research_search_rate_limits.window_started_at <= now() - interval '1 minute'
       or public.research_search_rate_limits.request_count < 8
  returning request_count <= 8 into claimed;

  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_research_search_request(uuid) from public, anon, authenticated;
grant execute on function public.claim_research_search_request(uuid) to service_role;
