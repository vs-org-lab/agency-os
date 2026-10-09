-- Rooms access: privileges, staff row level security and client portal views. Every write
-- (templates, projects, phases, steps, updates, approvals) runs in server services that authorise
-- the caller and write as the system, so authenticated users only read.

-- Privileges ---------------------------------------------------------------

revoke all on table
  public.process_templates,
  public.projects,
  public.project_phases,
  public.project_steps,
  public.project_updates,
  public.approvals
from anon, authenticated, service_role;

grant select on table
  public.process_templates,
  public.projects,
  public.project_phases,
  public.project_steps,
  public.project_updates,
  public.approvals
to authenticated;

-- Access functions ---------------------------------------------------------

-- "Salas e processo" in the access matrix: founder and finance read every client; project
-- managers and freelancers read the clients they are assigned to.
create or replace function app.can_read_rooms(p_organization uuid, p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_org_role(p_organization, array['founder', 'finance']::app.org_role[])
    or (
      p_client is not null
      and app.has_org_role(
        p_organization, array['project_manager', 'freelancer']::app.org_role[]
      )
      and app.is_assigned_staff(p_client)
    );
$$;

create or replace function app.can_write_rooms(p_organization uuid, p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_org_role(p_organization, array['founder']::app.org_role[])
    or (
      p_client is not null
      and app.has_org_role(p_organization, array['project_manager']::app.org_role[])
      and app.is_assigned_staff(p_client)
    );
$$;

revoke execute on function app.can_read_rooms(uuid, uuid) from public, anon;
revoke execute on function app.can_write_rooms(uuid, uuid) from public, anon;
grant execute on function app.can_read_rooms(uuid, uuid) to authenticated;
grant execute on function app.can_write_rooms(uuid, uuid) to authenticated;

-- Row level security --------------------------------------------------------

alter table public.process_templates force row level security;
alter table public.projects force row level security;
alter table public.project_phases force row level security;
alter table public.project_steps force row level security;
alter table public.project_updates force row level security;
alter table public.approvals force row level security;

create policy process_templates_select on public.process_templates
  for select to authenticated
  using (
    app.has_org_role(organization_id, array['founder', 'project_manager']::app.org_role[])
  );

create policy projects_select on public.projects
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));

create policy project_phases_select on public.project_phases
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));

create policy project_steps_select on public.project_steps
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));

create policy project_updates_select on public.project_updates
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));

create policy approvals_select on public.approvals
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));

-- Portal views -------------------------------------------------------------------

-- The client's decision maker and operational users read their room. Client finance does not.
-- The views run with their owner's privileges, so they expose only client-visible items and
-- filter rows themselves (RN-50).
create view public.portal_projects with (security_barrier = true) as
  select p.id, p.client_id, p.name, p.status, p.starts_on, p.ends_on, p.created_at
  from public.projects p
  where p.status <> 'cancelled'
    and app.is_client_member(
      p.client_id, array['decision_maker', 'operational']::app.client_role[]
    );

create view public.portal_project_phases with (security_barrier = true) as
  select ph.id, ph.client_id, ph.project_id, ph.position, ph.name, ph.requires_approval,
         ph.status, ph.due_on, ph.started_at, ph.completed_at
  from public.project_phases ph
  join public.projects p on p.id = ph.project_id
  where p.status <> 'cancelled'
    and app.is_client_member(
      ph.client_id, array['decision_maker', 'operational']::app.client_role[]
    );

create view public.portal_project_steps with (security_barrier = true) as
  select s.id, s.client_id, s.project_id, s.phase_id, s.position, s.name, s.status, s.due_on,
         s.shared_at, s.reopened_after_shared
  from public.project_steps s
  join public.projects p on p.id = s.project_id
  where s.visible_to_client
    and p.status <> 'cancelled'
    and app.is_client_member(
      s.client_id, array['decision_maker', 'operational']::app.client_role[]
    );

create view public.portal_project_updates with (security_barrier = true) as
  select u.id, u.client_id, u.project_id, u.kind, u.body, u.milestone, u.created_at,
         pr.full_name as author_name
  from public.project_updates u
  join public.projects p on p.id = u.project_id
  left join public.profiles pr on pr.id = u.author_id
  where u.visibility = 'client'
    and p.status <> 'cancelled'
    and app.is_client_member(
      u.client_id, array['decision_maker', 'operational']::app.client_role[]
    );

create view public.portal_approvals with (security_barrier = true) as
  select a.id, a.client_id, a.project_id, a.subject_type, a.subject_id, a.status,
         a.requested_at, a.decided_at, a.comment
  from public.approvals a
  join public.projects p on p.id = a.project_id
  where a.status <> 'withdrawn'
    and p.status <> 'cancelled'
    and app.is_client_member(
      a.client_id, array['decision_maker', 'operational']::app.client_role[]
    );

revoke all on table
  public.portal_projects,
  public.portal_project_phases,
  public.portal_project_steps,
  public.portal_project_updates,
  public.portal_approvals
from anon, authenticated, service_role;
grant select on table
  public.portal_projects,
  public.portal_project_phases,
  public.portal_project_steps,
  public.portal_project_updates,
  public.portal_approvals
to authenticated;
