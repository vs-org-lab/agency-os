-- Aurion Core access: privileges, studio and portal row level security, portal view and evidence bucket.

-- Privileges ---------------------------------------------------------------

revoke all on table
  public.core_templates,
  public.core_engagements,
  public.core_briefing_notes,
  public.core_findings,
  public.core_scores,
  public.documents
from anon, authenticated, service_role;

grant select, insert on table public.core_templates to authenticated;
grant update (is_active) on table public.core_templates to authenticated;

grant select, insert on table public.core_engagements to authenticated;
grant update (
  transcript, buyer_test_url, narrative, briefing_shared_at, cross_review_by, cross_review_at,
  cross_review_notes, updated_at
) on table public.core_engagements to authenticated;

grant select, insert on table public.core_briefing_notes to authenticated;
grant update (body, author_id, updated_at) on table public.core_briefing_notes to authenticated;

grant select, insert, delete on table public.core_findings to authenticated;
grant update (
  front, title, description, evidence_kind, evidence_path, evidence_value, evidence_note, impact,
  effort, lane, owner, bring_to_call, position, updated_at
) on table public.core_findings to authenticated;

grant select, insert on table public.core_scores to authenticated;
grant update (points, justification, updated_by, updated_at)
  on table public.core_scores to authenticated;

grant select, insert, delete on table public.documents to authenticated;
grant update (title, url, status, shared_at, updated_at) on table public.documents to authenticated;

-- Row level security --------------------------------------------------------

alter table public.core_templates force row level security;
alter table public.core_engagements force row level security;
alter table public.core_briefing_notes force row level security;
alter table public.core_findings force row level security;
alter table public.core_scores force row level security;
alter table public.documents force row level security;

create policy core_templates_select on public.core_templates
  for select to authenticated
  using (
    app.has_org_role(organization_id, array['founder', 'project_manager', 'finance']::app.org_role[])
  );
create policy core_templates_insert on public.core_templates
  for insert to authenticated
  with check (app.has_org_role(organization_id, array['founder']::app.org_role[]));
create policy core_templates_update on public.core_templates
  for update to authenticated
  using (app.has_org_role(organization_id, array['founder']::app.org_role[]))
  with check (app.has_org_role(organization_id, array['founder']::app.org_role[]));

create policy core_engagements_select on public.core_engagements
  for select to authenticated using (app.can_read_pipeline(organization_id, client_id));
create policy core_engagements_insert on public.core_engagements
  for insert to authenticated with check (app.can_write_pipeline(organization_id, client_id));
create policy core_engagements_update on public.core_engagements
  for update to authenticated
  using (app.can_write_pipeline(organization_id, client_id))
  with check (app.can_write_pipeline(organization_id, client_id));

create or replace function app.core_briefing_is_shared(p_engagement uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.core_engagements e
    where e.id = p_engagement and e.briefing_shared_at is not null
  );
$$;

revoke execute on function app.core_briefing_is_shared(uuid) from public, anon;
grant execute on function app.core_briefing_is_shared(uuid) to authenticated;

create policy core_briefing_notes_select on public.core_briefing_notes
  for select to authenticated
  using (
    app.can_read_pipeline(organization_id, client_id)
    or (app.is_client_member(client_id) and app.core_briefing_is_shared(engagement_id))
  );
create policy core_briefing_notes_insert on public.core_briefing_notes
  for insert to authenticated with check (app.can_write_pipeline(organization_id, client_id));
create policy core_briefing_notes_update on public.core_briefing_notes
  for update to authenticated
  using (app.can_write_pipeline(organization_id, client_id))
  with check (app.can_write_pipeline(organization_id, client_id));

create policy core_findings_select on public.core_findings
  for select to authenticated using (app.can_read_pipeline(organization_id, client_id));
create policy core_findings_insert on public.core_findings
  for insert to authenticated with check (app.can_write_pipeline(organization_id, client_id));
create policy core_findings_update on public.core_findings
  for update to authenticated
  using (app.can_write_pipeline(organization_id, client_id))
  with check (app.can_write_pipeline(organization_id, client_id));
create policy core_findings_delete on public.core_findings
  for delete to authenticated using (app.can_write_pipeline(organization_id, client_id));

create policy core_scores_select on public.core_scores
  for select to authenticated using (app.can_read_pipeline(organization_id, client_id));
create policy core_scores_insert on public.core_scores
  for insert to authenticated with check (app.can_write_pipeline(organization_id, client_id));
create policy core_scores_update on public.core_scores
  for update to authenticated
  using (app.can_write_pipeline(organization_id, client_id))
  with check (app.can_write_pipeline(organization_id, client_id));

create policy documents_select on public.documents
  for select to authenticated
  using (
    app.can_read_pipeline(organization_id, client_id)
    or (status = 'with_client' and app.is_client_member(client_id))
  );
create policy documents_insert on public.documents
  for insert to authenticated with check (app.can_write_pipeline(organization_id, client_id));
create policy documents_update on public.documents
  for update to authenticated
  using (app.can_write_pipeline(organization_id, client_id))
  with check (app.can_write_pipeline(organization_id, client_id));
create policy documents_delete on public.documents
  for delete to authenticated using (app.can_write_pipeline(organization_id, client_id));

-- Portal view ----------------------------------------------------------------

-- Client users must never read the internal columns of a Core (transcript, narrative,
-- cross review). The view exposes only the shareable columns of shared briefings and filters
-- rows by client membership itself, because it runs with its owner's privileges.
create view public.portal_core_engagements with (security_barrier = true) as
  select e.id, e.organization_id, e.client_id, e.deal_id, e.briefing_shared_at,
         t.definition as briefing_guide
  from public.core_engagements e
  join public.core_templates t on t.id = e.briefing_template_id
  where e.briefing_shared_at is not null
    and app.is_client_member(e.client_id);

revoke all on table public.portal_core_engagements from anon, authenticated, service_role;
grant select on table public.portal_core_engagements to authenticated;

-- Evidence bucket ---------------------------------------------------------------

-- The local CI database starts without the Storage API, so the bucket is created only where
-- the storage schema exists. Objects are reached only by the server with signed URLs; there are
-- no policies on storage.objects for this bucket.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'core-evidence', 'core-evidence', false, 10485760,
      array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
    )
    on conflict (id) do nothing;
  end if;
end;
$$;
