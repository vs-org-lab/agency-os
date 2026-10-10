-- Tasks access: internal tasks are read by the team that reads the client's room, by founders and
-- project managers when they belong to no client, and always by their assignee. Clients never
-- read tasks. Every write runs in server services that authorise the caller.

-- Privileges ---------------------------------------------------------------

revoke all on table public.tasks, public.task_items from anon, authenticated, service_role;
grant select on table public.tasks, public.task_items to authenticated;

-- Access functions ---------------------------------------------------------

create or replace function app.can_read_task(
  p_organization uuid,
  p_client uuid,
  p_assignee uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (p_assignee is not null and p_assignee = (select auth.uid()))
    or (p_client is not null and app.can_read_rooms(p_organization, p_client))
    or (
      p_client is null
      and app.has_org_role(p_organization, array['founder', 'project_manager']::app.org_role[])
    );
$$;

revoke execute on function app.can_read_task(uuid, uuid, uuid) from public, anon;
grant execute on function app.can_read_task(uuid, uuid, uuid) to authenticated;

-- Row level security --------------------------------------------------------

alter table public.tasks force row level security;
alter table public.task_items force row level security;

create policy tasks_select on public.tasks
  for select to authenticated
  using (app.can_read_task(organization_id, client_id, assignee_id));

create policy task_items_select on public.task_items
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_items.task_id
        and app.can_read_task(t.organization_id, t.client_id, t.assignee_id)
    )
  );
