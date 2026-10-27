-- Retainer requests: the team reads them like the retainer; clients never read the table. A client
-- follows its own requests through a function that returns a derived state and nothing else of
-- the team task (assignee, notes and the internal title stay out). Writes run in the request
-- service after authorisation.

revoke all on table public.retainer_requests from anon, authenticated, service_role;--> statement-breakpoint
grant select on table public.retainer_requests to authenticated;--> statement-breakpoint
alter table public.retainer_requests force row level security;--> statement-breakpoint

create policy retainer_requests_select on public.retainer_requests
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint

create or replace function app.client_retainer_requests(p_client uuid)
returns table (
  id uuid,
  description text,
  state text,
  created_at timestamptz,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id,
         r.description,
         case
           when t.id is null then 'received'
           when t.status = 'done' then 'done'
           when t.assignee_id is not null then 'in_progress'
           else 'received'
         end,
         r.created_at,
         case when t.status = 'done' then t.completed_at end
  from public.retainer_requests r
  left join public.tasks t on t.id = r.task_id
  where r.client_id = p_client
    and app.is_client_member(p_client, array['decision_maker', 'operational']::app.client_role[])
  order by r.created_at desc;
$$;--> statement-breakpoint

revoke execute on function app.client_retainer_requests(uuid) from public, anon;--> statement-breakpoint
grant execute on function app.client_retainer_requests(uuid) to authenticated;
