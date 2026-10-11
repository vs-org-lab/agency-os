-- Brand hub access: the room writers and the freelancers of one of the client's projects read the
-- hub draft (finance does not, per the access matrix); the client's decision maker and
-- operational users read, through views, only the current publication and the assets it lists
-- (RN-80, SEC-41). Every write runs in server services.

create or replace function app.can_edit_brand_hub(p_organization uuid, p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_write_rooms(p_organization, p_client)
    or (
      app.has_org_role(p_organization, array['freelancer']::app.org_role[])
      and exists (
        select 1 from public.projects p
        where p.client_id = p_client
          and p.organization_id = p_organization
          and app.is_project_staff(p.id)
      )
    );
$$;
revoke execute on function app.can_edit_brand_hub(uuid, uuid) from public, anon;
grant execute on function app.can_edit_brand_hub(uuid, uuid) to authenticated;

-- Privileges ---------------------------------------------------------------

revoke all on table public.brand_hubs, public.brand_hub_pages, public.brand_hub_blocks,
  public.brand_hub_assets, public.brand_hub_publications
from anon, authenticated, service_role;
grant select on table public.brand_hubs, public.brand_hub_pages, public.brand_hub_blocks,
  public.brand_hub_assets, public.brand_hub_publications
to authenticated;

-- Row level security --------------------------------------------------------

alter table public.brand_hubs force row level security;
alter table public.brand_hub_pages force row level security;
alter table public.brand_hub_blocks force row level security;
alter table public.brand_hub_assets force row level security;
alter table public.brand_hub_publications force row level security;

create policy brand_hubs_select on public.brand_hubs
  for select to authenticated using (app.can_edit_brand_hub(organization_id, client_id));

create policy brand_hub_pages_select on public.brand_hub_pages
  for select to authenticated using (app.can_edit_brand_hub(organization_id, client_id));

create policy brand_hub_blocks_select on public.brand_hub_blocks
  for select to authenticated using (app.can_edit_brand_hub(organization_id, client_id));

create policy brand_hub_assets_select on public.brand_hub_assets
  for select to authenticated using (app.can_edit_brand_hub(organization_id, client_id));

create policy brand_hub_publications_select on public.brand_hub_publications
  for select to authenticated using (app.can_edit_brand_hub(organization_id, client_id));

-- Portal views -------------------------------------------------------------

create view public.portal_brand_hub_publications with (security_barrier = true) as
  select pub.id, pub.client_id, pub.number, pub.snapshot, pub.published_at,
         h.approved_publication_id = pub.id as approved
  from public.brand_hubs h
  join public.brand_hub_publications pub on pub.id = h.published_publication_id
  where app.is_client_member(
    h.client_id, array['decision_maker', 'operational']::app.client_role[]
  );

create view public.portal_brand_hub_assets with (security_barrier = true) as
  select a.id, a.client_id, a.name, a.mime_type, a.size_bytes, a.storage_path
  from public.brand_hub_assets a
  join public.portal_brand_hub_publications pub on pub.client_id = a.client_id
  where a.upload_status = 'ready'
    and exists (
      select 1 from jsonb_array_elements(pub.snapshot -> 'assets') listed
      where listed ->> 'id' = a.id::text
    );

revoke all on table public.portal_brand_hub_publications, public.portal_brand_hub_assets
from anon, authenticated, service_role;
grant select on table public.portal_brand_hub_publications, public.portal_brand_hub_assets
to authenticated;
