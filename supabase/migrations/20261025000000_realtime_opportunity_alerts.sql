-- Enable signed-in clients to receive row-change events for their own
-- scholarship opportunity records. Row-level security still limits reads.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'scholarship_opportunities'
    ) then
    alter publication supabase_realtime add table public.scholarship_opportunities;
  end if;
end $$;
