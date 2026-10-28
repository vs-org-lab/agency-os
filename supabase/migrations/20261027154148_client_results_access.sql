-- Client results (RD-3): the team reads indicators and values like the room; writes run in the
-- results service after authorisation. Clients never read the tables: they read the visible,
-- live indicators of their own client, with the last twelve months of values, through a function.

revoke all on table public.client_kpis from anon, authenticated, service_role;--> statement-breakpoint
revoke all on table public.client_kpi_values from anon, authenticated, service_role;--> statement-breakpoint
grant select on table public.client_kpis to authenticated;--> statement-breakpoint
grant select on table public.client_kpi_values to authenticated;--> statement-breakpoint
alter table public.client_kpis force row level security;--> statement-breakpoint
alter table public.client_kpi_values force row level security;--> statement-breakpoint

create policy client_kpis_select on public.client_kpis
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint

create policy client_kpi_values_select on public.client_kpi_values
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint

create or replace function app.client_kpi_results(p_client uuid)
returns table (
  kpi_id uuid,
  name text,
  format app.kpi_format,
  source text,
  target numeric,
  kpi_position integer,
  month date,
  value numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id,
         k.name,
         k.format,
         k.source,
         k.target,
         k.position,
         v.month,
         v.value
  from public.client_kpis k
  left join public.client_kpi_values v
    on v.kpi_id = k.id
   and v.month >= (date_trunc('month', now() at time zone 'Europe/Lisbon') - interval '11 months')::date
  where k.client_id = p_client
    and k.client_visible
    and k.archived_at is null
    and app.is_client_member(p_client, array['decision_maker', 'operational']::app.client_role[])
  order by k.position, k.created_at, v.month;
$$;--> statement-breakpoint

revoke execute on function app.client_kpi_results(uuid) from public, anon;--> statement-breakpoint
grant execute on function app.client_kpi_results(uuid) to authenticated;
