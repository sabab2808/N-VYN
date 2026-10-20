alter table public.profiles
  add column if not exists ielts_booking_date date,
  add column if not exists ielts_result_date date,
  add column if not exists ielts_score text not null default '',
  add column if not exists upfront_budget text not null default '',
  add column if not exists passport_expiry date;

alter table public.programs
  add column if not exists program_details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(program_details) = 'object');

alter table public.applications
  add column if not exists decision text,
  add column if not exists notes text not null default '',
  add column if not exists next_action text;

create or replace function public.export_my_account_data()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  table_name text;
  table_names text[] := array[
    'universities','programs','applications','source_evidence','source_changes','funding_items',
    'admission_rounds','tasks','task_dependencies','task_checklist_items','task_history','documents',
    'document_requirements','professor_contacts','reminders','notifications','activity_log','refresh_logs',
    'budget_scenarios','scholarship_opportunities'
  ];
  exported jsonb := jsonb_build_object('exported_at', now());
  table_rows jsonb;
begin
  if owner_id is null then
    raise exception 'Authentication is required to export account data.';
  end if;

  select to_jsonb(p) into table_rows from public.profiles p where p.id = owner_id;
  exported := exported || jsonb_build_object('profiles', coalesce(table_rows, 'null'::jsonb));

  foreach table_name in array table_names loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(row_data)), ''[]''::jsonb) from public.%I row_data where user_id = $1',
      table_name
    ) into table_rows using owner_id;
    exported := exported || jsonb_build_object(table_name, table_rows);
  end loop;

  return exported;
end;
$$;

revoke all on function public.export_my_account_data() from public, anon;
grant execute on function public.export_my_account_data() to authenticated;

drop function if exists public.delete_my_account();
