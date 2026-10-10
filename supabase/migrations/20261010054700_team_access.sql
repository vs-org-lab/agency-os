-- Team access: project-level access for freelancers (RN-51) and the team's rates. Freelancers read a
-- project's rows only when assigned to that project; managers keep every project of their clients.
-- Rates are values, read by founders and finance only. Every write runs in server services.

-- Privileges ---------------------------------------------------------------

revoke all on table public.project_staff_assignments, public.team_member_rates
from anon, authenticated, service_role;
grant select on table public.project_staff_assignments, public.team_member_rates to authenticated;

-- Access functions ---------------------------------------------------------

create or replace function app.is_project_staff(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_mfa_verified() and exists (
    select 1
    from public.project_staff_assignments a
    join public.organization_memberships m
      on m.organization_id = a.organization_id and m.user_id = a.user_id
    where a.project_id = p_project
      and a.user_id = (select auth.uid())
      and a.archived_at is null
      and m.status = 'active'
      and m.archived_at is null
  );
$$;

create or replace function app.can_read_project(
  p_organization uuid,
  p_client uuid,
  p_project uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_org_role(p_organization, array['founder', 'finance']::app.org_role[])
    or (
      app.has_org_role(p_organization, array['project_manager']::app.org_role[])
      and app.is_assigned_staff(p_client)
    )
    or (
      app.has_org_role(p_organization, array['freelancer']::app.org_role[])
      and app.is_assigned_staff(p_client)
      and app.is_project_staff(p_project)
    );
$$;

create or replace function app.can_read_task(
  p_organization uuid,
  p_client uuid,
  p_project uuid,
  p_assignee uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
      p_assignee is not null
      and p_assignee = (select auth.uid())
      and app.is_org_member(p_organization)
    )
    or (
      p_client is not null
      and p_project is null
      and app.can_read_rooms(p_organization, p_client)
    )
    or (p_project is not null and app.can_read_project(p_organization, p_client, p_project))
    or (
      p_client is null
      and app.has_org_role(p_organization, array['founder', 'project_manager']::app.org_role[])
    );
$$;

revoke execute on function app.is_project_staff(uuid) from public, anon;
revoke execute on function app.can_read_project(uuid, uuid, uuid) from public, anon;
revoke execute on function app.can_read_task(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function app.is_project_staff(uuid) to authenticated;
grant execute on function app.can_read_project(uuid, uuid, uuid) to authenticated;
grant execute on function app.can_read_task(uuid, uuid, uuid, uuid) to authenticated;

-- Row level security --------------------------------------------------------

alter table public.project_staff_assignments force row level security;
alter table public.team_member_rates force row level security;

create policy project_staff_assignments_select on public.project_staff_assignments
  for select to authenticated
  using (
    app.has_org_role(organization_id, array['founder']::app.org_role[])
    or (user_id = (select auth.uid()) and app.is_org_member(organization_id))
  );

create policy team_member_rates_select on public.team_member_rates
  for select to authenticated
  using (app.has_org_role(organization_id, array['founder', 'finance']::app.org_role[]));

drop policy projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated using (app.can_read_project(organization_id, client_id, id));

drop policy project_phases_select on public.project_phases;
create policy project_phases_select on public.project_phases
  for select to authenticated using (app.can_read_project(organization_id, client_id, project_id));

drop policy project_steps_select on public.project_steps;
create policy project_steps_select on public.project_steps
  for select to authenticated using (app.can_read_project(organization_id, client_id, project_id));

drop policy project_updates_select on public.project_updates;
create policy project_updates_select on public.project_updates
  for select to authenticated using (app.can_read_project(organization_id, client_id, project_id));

drop policy approvals_select on public.approvals;
create policy approvals_select on public.approvals
  for select to authenticated using (app.can_read_project(organization_id, client_id, project_id));

drop policy tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (app.can_read_task(organization_id, client_id, project_id, assignee_id));

drop policy task_items_select on public.task_items;
create policy task_items_select on public.task_items
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_items.task_id
        and app.can_read_task(t.organization_id, t.client_id, t.project_id, t.assignee_id)
    )
  );

drop function app.can_read_task(uuid, uuid, uuid);
