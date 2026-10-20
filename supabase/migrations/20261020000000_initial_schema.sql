create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  institution text not null default 'Daffodil International University',
  degree text not null default 'BSc in Computer Science & Engineering',
  cgpa text not null default '3.68 / 4.00',
  ssc_gpa text not null default '5.00',
  hsc_gpa text not null default '5.00',
  academic_status text not null default 'Final semester',
  language_test text not null default 'IELTS booked',
  target_intake text not null default 'Fall 2027',
  funding_needs text not null default 'Tuition + living costs + essential expenses',
  timezone text not null default 'Asia/Dhaka',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.universities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  city text,
  category text not null default 'Match' check (category in ('Ambitious', 'Match', 'Funding-focused')),
  rank integer not null default 99 check (rank > 0),
  coverage_summary text not null default 'Not confirmed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  degree text,
  department text,
  research_area text,
  application_portal text,
  supervisor_consent_required boolean,
  language_requirements jsonb not null default '{}'::jsonb,
  recommendation_requirements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (university_id, user_id) references public.universities(id, user_id) on delete cascade,
  unique (id, user_id),
  unique (id, user_id, university_id)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null,
  program_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null default 'Researching' check (stage in ('Researching', 'Supervisor contact', 'Preparing', 'Submitted', 'Interview', 'Admitted', 'Waitlisted', 'Rejected', 'Offer accepted', 'Visa', 'Pre-departure')),
  submitted_at date,
  decision_at date,
  decision text,
  notes text not null default '',
  next_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (university_id, user_id) references public.universities(id, user_id) on delete cascade,
  foreign key (program_id, user_id, university_id) references public.programs(id, user_id, university_id) on delete cascade,
  unique (id, user_id)
);

create table public.source_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  university_id uuid,
  program_id uuid,
  funding_item_id uuid,
  source_type text not null,
  url text not null,
  field_key text,
  field_value jsonb,
  intake text not null default 'Fall 2027',
  published_at date,
  last_checked_at timestamptz,
  last_attempted_at timestamptz,
  verification_status text not null default 'unknown' check (verification_status in ('unverified', 'confirmed', 'historical', 'estimate', 'unknown')),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  verifier_note text,
  needs_review boolean not null default false,
  last_http_status integer,
  content_sha256 text,
  etag text,
  last_modified text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (verification_status <> 'confirmed' or (verified_by = user_id and verified_at is not null)),
  foreign key (university_id, user_id) references public.universities(id, user_id) on delete cascade,
  foreign key (program_id, user_id, university_id) references public.programs(id, user_id, university_id) on delete cascade,
  check (program_id is null or university_id is not null),
  unique (id, user_id)
);

create table public.source_changes (
  id uuid primary key default gen_random_uuid(),
  source_evidence_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  old_sha256 text,
  new_sha256 text not null,
  detected_at timestamptz not null default now(),
  review_status text not null default 'pending' check (review_status in ('pending', 'reviewed', 'dismissed')),
  foreign key (source_evidence_id, user_id) references public.source_evidence(id, user_id) on delete cascade
);

create table public.funding_items (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null,
  program_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  route text,
  eligibility jsonb not null default '{}'::jsonb,
  tuition_coverage numeric,
  tuition_coverage_unit text,
  monthly_stipend numeric,
  stipend_currency text,
  duration_months integer,
  renewal_rules text,
  insurance jsonb,
  housing jsonb,
  funding_start_date date,
  application_fee numeric,
  application_fee_currency text,
  conditional boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (university_id, user_id) references public.universities(id, user_id) on delete cascade,
  foreign key (program_id, user_id, university_id) references public.programs(id, user_id, university_id) on delete cascade,
  check (program_id is null or university_id is not null),
  check (tuition_coverage is null or tuition_coverage between 0 and 100),
  check (duration_months is null or duration_months > 0),
  unique (id, user_id),
  unique (id, user_id, university_id)
);
alter table public.source_evidence add constraint source_evidence_funding_owner_fk
  foreign key (funding_item_id, user_id, university_id) references public.funding_items(id, user_id, university_id) on delete cascade,
  add constraint source_evidence_funding_context_check check (funding_item_id is null or university_id is not null);

create table public.admission_rounds (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  intake text not null,
  round_name text,
  application_open date,
  application_deadline date,
  decision_date date,
  verification_status text not null default 'unknown' check (verification_status in ('unverified', 'confirmed', 'historical', 'estimate', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (program_id, user_id) references public.programs(id, user_id) on delete cascade
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid,
  title text not null,
  description text not null default '',
  due_date date,
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  recurring_rule text,
  reminder_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (application_id, user_id) references public.applications(id, user_id) on delete cascade,
  unique (id, user_id)
);

create table public.task_dependencies (
  task_id uuid not null,
  depends_on_task_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade,
  foreign key (depends_on_task_id, user_id) references public.tasks(id, user_id) on delete cascade
);

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  is_complete boolean not null default false,
  completed_at timestamptz,
  sort_order integer not null default 0,
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade,
  unique (id, user_id)
);

create table public.task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  previous_value jsonb,
  new_value jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  document_type text not null,
  storage_path text unique,
  issued_at date,
  expires_at date,
  translation_status text not null default 'unknown',
  notarization_status text not null default 'unknown',
  apostille_status text not null default 'unknown',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.document_requirements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid,
  university_id uuid not null,
  program_id uuid,
  requirement_name text not null,
  requirement_status text not null default 'unknown' check (requirement_status in ('unknown', 'required', 'optional', 'not_required')),
  notes text not null default '',
  foreign key (document_id, user_id) references public.documents(id, user_id) on delete set null (document_id),
  foreign key (university_id, user_id) references public.universities(id, user_id) on delete cascade,
  foreign key (program_id, user_id, university_id) references public.programs(id, user_id, university_id) on delete cascade,
  check (program_id is null or university_id is not null)
);

create table public.professor_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  university_id uuid,
  program_id uuid,
  professor_name text not null,
  lab_name text,
  email text,
  research_fit text not null default '',
  papers_read jsonb not null default '[]'::jsonb,
  contacted_at date,
  follow_up_at date,
  reply_summary text,
  funding_statement text,
  next_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (university_id, user_id) references public.universities(id, user_id) on delete cascade,
  foreign key (program_id, user_id, university_id) references public.programs(id, user_id, university_id) on delete cascade,
  check (program_id is null or university_id is not null)
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  remind_at timestamptz not null,
  recurrence_rule text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  entity_type text,
  entity_id uuid,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table public.refresh_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_evidence_id uuid,
  outcome text not null check (outcome in ('success', 'not_modified', 'failed', 'rate_limited', 'skipped')),
  http_status integer,
  attempt_count integer not null default 1,
  duration_ms integer,
  error_message text,
  checked_at timestamptz not null default now(),
  foreign key (source_evidence_id, user_id) references public.source_evidence(id, user_id) on delete set null (source_evidence_id)
);

create index universities_owner_idx on public.universities(user_id, rank);
create index applications_owner_idx on public.applications(user_id, stage);
create index source_evidence_owner_idx on public.source_evidence(user_id, university_id);
create index source_evidence_refresh_queue_idx on public.source_evidence(last_attempted_at asc nulls first);
create index tasks_owner_due_idx on public.tasks(user_id, due_date) where status <> 'done';
create index notifications_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;
create index refresh_logs_owner_idx on public.refresh_logs(user_id, checked_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare tbl text;
begin
  foreach tbl in array array['universities','programs','applications','source_evidence','funding_items','admission_rounds','tasks','documents','professor_contacts'] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', tbl, tbl);
  end loop;
end
$$;

alter table public.profiles enable row level security;
create policy profiles_owner_all on public.profiles for all to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant select, insert, update, delete on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'universities','programs','applications','source_evidence','source_changes','funding_items',
    'admission_rounds','tasks','task_dependencies','task_checklist_items','task_history','documents',
    'document_requirements','professor_contacts','reminders','notifications','activity_log','refresh_logs'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', tbl || '_owner_all', tbl);
    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
  end loop;
end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('private-documents', 'private-documents', false, 20971520, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;

create policy "Private documents: user can read own folder"
on storage.objects for select to authenticated
using (bucket_id = 'private-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Private documents: user can upload to own folder"
on storage.objects for insert to authenticated
with check (bucket_id = 'private-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Private documents: user can update own folder"
on storage.objects for update to authenticated
using (bucket_id = 'private-documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'private-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Private documents: user can delete own folder"
on storage.objects for delete to authenticated
using (bucket_id = 'private-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
