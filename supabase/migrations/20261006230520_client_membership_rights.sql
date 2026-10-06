-- Only the founder and the client's decision maker invite client users (docs/product/08, users row).

drop policy client_memberships_insert on public.client_memberships;
create policy client_memberships_insert on public.client_memberships
  for insert to authenticated
  with check (
    app.has_org_role(organization_id, array['founder']::app.org_role[])
    or (
      status = 'invited'
      and app.is_client_member(client_id, array['decision_maker']::app.client_role[])
    )
  );

drop policy client_memberships_update on public.client_memberships;
create policy client_memberships_update on public.client_memberships
  for update to authenticated
  using (app.has_org_role(organization_id, array['founder']::app.org_role[]))
  with check (app.has_org_role(organization_id, array['founder']::app.org_role[]));
