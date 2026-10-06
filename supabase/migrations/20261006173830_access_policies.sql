-- Tenant isolation: privileges, access functions and row level security policies.

-- Privileges ---------------------------------------------------------------

revoke all on table
  public.organizations,
  public.profiles,
  public.organization_memberships,
  public.clients,
  public.client_memberships,
  public.client_staff_assignments,
  public.audit_log,
  public.domain_events
from anon, authenticated, service_role;

revoke all on schema app from public, anon;
grant usage on schema app to authenticated;

grant select on table public.organizations to authenticated;
grant update (name, default_locale, default_currency, portal_branding, updated_at)
  on table public.organizations to authenticated;

grant select on table public.profiles to authenticated;
grant update (full_name, locale, updated_at) on table public.profiles to authenticated;

grant select, insert on table public.organization_memberships to authenticated;
grant update (role, status, archived_at, updated_at)
  on table public.organization_memberships to authenticated;

grant select, insert on table public.clients to authenticated;
grant update (name, tax_id, sector, size, logo_path, portal_domain, archived_at, updated_at)
  on table public.clients to authenticated;

grant select, insert on table public.client_memberships to authenticated;
grant update (role, status, archived_at, updated_at)
  on table public.client_memberships to authenticated;

grant select, insert on table public.client_staff_assignments to authenticated;
grant update (archived_at, updated_at) on table public.client_staff_assignments to authenticated;

grant select on table public.audit_log to authenticated;

-- Access functions ---------------------------------------------------------

create or replace function app.is_mfa_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false);
$$;

create or replace function app.has_org_role(p_organization uuid, p_roles app.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_mfa_verified() and exists (
    select 1
    from public.organization_memberships m
    join public.profiles p on p.id = m.user_id
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = p_organization
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
      and m.status = 'active'
      and m.archived_at is null
      and p.archived_at is null
      and o.archived_at is null
  );
$$;

create or replace function app.is_org_member(p_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_org_role(p_organization, enum_range(null::app.org_role));
$$;

create or replace function app.is_assigned_staff(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_mfa_verified() and exists (
    select 1
    from public.client_staff_assignments a
    join public.organization_memberships m
      on m.organization_id = a.organization_id and m.user_id = a.user_id
    join public.profiles p on p.id = a.user_id
    where a.client_id = p_client
      and a.user_id = (select auth.uid())
      and a.archived_at is null
      and m.status = 'active'
      and m.archived_at is null
      and p.archived_at is null
  );
$$;

create or replace function app.is_client_member(p_client uuid, p_roles app.client_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.client_memberships cm
    join public.profiles p on p.id = cm.user_id
    where cm.client_id = p_client
      and cm.user_id = (select auth.uid())
      and cm.status = 'active'
      and cm.archived_at is null
      and p.archived_at is null
      and (p_roles is null or cm.role = any (p_roles))
  );
$$;

create or replace function app.has_client_access(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client
      and c.archived_at is null
      and (
        app.has_org_role(c.organization_id, array['founder', 'finance']::app.org_role[])
        or app.is_assigned_staff(c.id)
        or app.is_client_member(c.id)
      )
  );
$$;

create or replace function app.is_client_of_organization(p_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clients c
    where c.organization_id = p_organization
      and c.archived_at is null
      and app.is_client_member(c.id)
  );
$$;

create or replace function app.can_see_profile(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile = (select auth.uid())
    or exists (
      select 1
      from public.organization_memberships mine
      join public.organization_memberships theirs on theirs.organization_id = mine.organization_id
      where mine.user_id = (select auth.uid())
        and theirs.user_id = p_profile
        and app.is_org_member(mine.organization_id)
    )
    or exists (
      select 1
      from public.client_memberships theirs
      where theirs.user_id = p_profile
        and theirs.archived_at is null
        and app.has_client_access(theirs.client_id)
    )
    or exists (
      select 1
      from public.client_staff_assignments theirs
      where theirs.user_id = p_profile
        and theirs.archived_at is null
        and app.has_client_access(theirs.client_id)
    );
$$;

revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

-- Row level security -------------------------------------------------------

alter table public.organizations force row level security;
alter table public.profiles force row level security;
alter table public.organization_memberships force row level security;
alter table public.clients force row level security;
alter table public.client_memberships force row level security;
alter table public.client_staff_assignments force row level security;
alter table public.audit_log force row level security;
alter table public.domain_events force row level security;

create policy organizations_select on public.organizations
  for select to authenticated
  using (
    archived_at is null
    and (app.is_org_member(id) or app.is_client_of_organization(id))
  );

create policy organizations_update on public.organizations
  for update to authenticated
  using (app.has_org_role(id, array['founder']::app.org_role[]))
  with check (app.has_org_role(id, array['founder']::app.org_role[]));

create policy profiles_select on public.profiles
  for select to authenticated
  using (app.can_see_profile(id));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy organization_memberships_select on public.organization_memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or app.has_org_role(organization_id, array['founder']::app.org_role[])
  );

create policy organization_memberships_insert on public.organization_memberships
  for insert to authenticated
  with check (app.has_org_role(organization_id, array['founder']::app.org_role[]));

create policy organization_memberships_update on public.organization_memberships
  for update to authenticated
  using (app.has_org_role(organization_id, array['founder']::app.org_role[]))
  with check (app.has_org_role(organization_id, array['founder']::app.org_role[]));

create policy clients_select on public.clients
  for select to authenticated
  using (app.has_client_access(id));

create policy clients_insert on public.clients
  for insert to authenticated
  with check (
    app.has_org_role(organization_id, array['founder', 'project_manager']::app.org_role[])
  );

create policy clients_update on public.clients
  for update to authenticated
  using (
    app.has_org_role(organization_id, array['founder']::app.org_role[])
    or (
      app.has_org_role(organization_id, array['project_manager']::app.org_role[])
      and app.is_assigned_staff(id)
    )
  )
  with check (
    app.has_org_role(organization_id, array['founder']::app.org_role[])
    or (
      app.has_org_role(organization_id, array['project_manager']::app.org_role[])
      and app.is_assigned_staff(id)
    )
  );

create policy client_memberships_select on public.client_memberships
  for select to authenticated
  using (
    app.has_org_role(organization_id, array['founder']::app.org_role[])
    or app.is_assigned_staff(client_id)
    or app.is_client_member(client_id)
  );

create policy client_memberships_insert on public.client_memberships
  for insert to authenticated
  with check (
    app.has_org_role(organization_id, array['founder']::app.org_role[])
    or (
      status = 'invited'
      and app.has_org_role(organization_id, array['project_manager']::app.org_role[])
      and app.is_assigned_staff(client_id)
    )
    or (
      status = 'invited'
      and app.is_client_member(client_id, array['decision_maker']::app.client_role[])
    )
  );

create policy client_memberships_update on public.client_memberships
  for update to authenticated
  using (
    app.has_org_role(organization_id, array['founder']::app.org_role[])
    or (
      app.has_org_role(organization_id, array['project_manager']::app.org_role[])
      and app.is_assigned_staff(client_id)
    )
  )
  with check (
    app.has_org_role(organization_id, array['founder']::app.org_role[])
    or (
      app.has_org_role(organization_id, array['project_manager']::app.org_role[])
      and app.is_assigned_staff(client_id)
    )
  );

create policy client_staff_assignments_select on public.client_staff_assignments
  for select to authenticated
  using (
    app.has_org_role(organization_id, array['founder']::app.org_role[])
    or (user_id = (select auth.uid()) and app.is_mfa_verified())
  );

create policy client_staff_assignments_insert on public.client_staff_assignments
  for insert to authenticated
  with check (app.has_org_role(organization_id, array['founder']::app.org_role[]));

create policy client_staff_assignments_update on public.client_staff_assignments
  for update to authenticated
  using (app.has_org_role(organization_id, array['founder']::app.org_role[]))
  with check (app.has_org_role(organization_id, array['founder']::app.org_role[]));

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (app.has_org_role(organization_id, array['founder']::app.org_role[]));

create policy domain_events_no_user_access on public.domain_events
  as restrictive
  for all to authenticated, anon
  using (false)
  with check (false);
