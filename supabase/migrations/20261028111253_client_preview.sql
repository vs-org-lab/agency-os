-- "Ver como cliente": the founder, or the project manager assigned to the client, reads the portal
-- views as the client's decision maker. The preview applies only inside a read-only transaction
-- that names the client in `app.preview_client`, so it never grants a write, an approval or a
-- decision; every other check keeps the caller's own identity.

create or replace function app.can_preview_client(p_client uuid)
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
        app.has_org_role(c.organization_id, array['founder']::app.org_role[])
        or (
          app.has_org_role(c.organization_id, array['project_manager']::app.org_role[])
          and app.is_assigned_staff(c.id)
        )
      )
  );
$$;

revoke execute on function app.can_preview_client(uuid) from public, anon;
grant execute on function app.can_preview_client(uuid) to authenticated;

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
  )
  -- The CASE keeps the access check from running outside a matching preview.
  or case
    when current_setting('transaction_read_only') = 'on'
      and current_setting('app.preview_client', true) = p_client::text
      and (p_roles is null or 'decision_maker' = any (p_roles))
    then app.can_preview_client(p_client)
    else false
  end;
$$;
