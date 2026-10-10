-- The assignee path now requires an active, MFA-verified organisation membership, like every other
-- staff read path (SEC-01 and access revocation on removal).
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
  select (
      p_assignee is not null
      and p_assignee = (select auth.uid())
      and app.is_org_member(p_organization)
    )
    or (p_client is not null and app.can_read_rooms(p_organization, p_client))
    or (
      p_client is null
      and app.has_org_role(p_organization, array['founder', 'project_manager']::app.org_role[])
    );
$$;
