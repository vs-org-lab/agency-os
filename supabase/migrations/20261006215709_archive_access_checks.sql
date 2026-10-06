-- Archived clients and organizations grant no access through staff assignments or client memberships.

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
    join public.clients c on c.id = a.client_id
    join public.organizations o on o.id = a.organization_id
    join public.organization_memberships m
      on m.organization_id = a.organization_id and m.user_id = a.user_id
    join public.profiles p on p.id = a.user_id
    where a.client_id = p_client
      and a.user_id = (select auth.uid())
      and a.archived_at is null
      and c.archived_at is null
      and o.archived_at is null
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
    join public.clients c on c.id = cm.client_id
    join public.organizations o on o.id = cm.organization_id
    join public.profiles p on p.id = cm.user_id
    where cm.client_id = p_client
      and cm.user_id = (select auth.uid())
      and cm.status = 'active'
      and cm.archived_at is null
      and c.archived_at is null
      and o.archived_at is null
      and p.archived_at is null
      and (p_roles is null or cm.role = any (p_roles))
  );
$$;

create or replace function app.is_active_organization(p_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organizations o where o.id = p_organization and o.archived_at is null
  );
$$;

create or replace function app.is_active_client(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clients c
    join public.organizations o on o.id = c.organization_id
    where c.id = p_client and c.archived_at is null and o.archived_at is null
  );
$$;

revoke execute on function app.is_active_organization(uuid) from public, anon;
revoke execute on function app.is_active_client(uuid) from public, anon;
grant execute on function app.is_active_organization(uuid) to authenticated;
grant execute on function app.is_active_client(uuid) to authenticated;
