-- Proofing access: the room team reads proofs of the projects it may read (RN-51); the client's
-- decision maker and operational users read, through views, only versions sent for approval and
-- comments that are not internal (RN-23). Every write runs in server services.

-- Privileges ---------------------------------------------------------------

revoke all on table public.proof_files, public.proof_versions, public.proof_comments
from anon, authenticated, service_role;
grant select on table public.proof_files, public.proof_versions, public.proof_comments
to authenticated;

-- Row level security --------------------------------------------------------

alter table public.proof_files force row level security;
alter table public.proof_versions force row level security;
alter table public.proof_comments force row level security;

create policy proof_files_select on public.proof_files
  for select to authenticated using (app.can_read_project(organization_id, client_id, project_id));

create policy proof_versions_select on public.proof_versions
  for select to authenticated using (app.can_read_project(organization_id, client_id, project_id));

create policy proof_comments_select on public.proof_comments
  for select to authenticated using (app.can_read_project(organization_id, client_id, project_id));

-- Portal views -------------------------------------------------------------

create view public.portal_proof_versions with (security_barrier = true) as
  select v.id, v.client_id, v.project_id, v.file_id, v.number, v.kind, v.mime_type, v.pages,
         v.created_at, f.title
  from public.proof_versions v
  join public.proof_files f on f.id = v.file_id
  join public.projects p on p.id = v.project_id
  where v.status = 'ready'
    and f.archived_at is null
    and p.status <> 'cancelled'
    and exists (
      select 1 from public.approvals a
      where a.subject_type = 'file_version' and a.subject_id = v.id
    )
    and app.is_client_member(
      v.client_id, array['decision_maker', 'operational']::app.client_role[]
    );

create view public.portal_proof_comments with (security_barrier = true) as
  select c.id, c.client_id, c.project_id, c.version_id, c.parent_id, c.body, c.anchor, c.number,
         c.resolved_at, c.created_at, c.author_id, pr.full_name as author_name,
         pr.kind = 'client' as by_client
  from public.proof_comments c
  join public.portal_proof_versions v on v.id = c.version_id
  left join public.profiles pr on pr.id = c.author_id
  where not c.internal;

revoke all on table public.portal_proof_versions, public.portal_proof_comments
from anon, authenticated, service_role;
grant select on table public.portal_proof_versions, public.portal_proof_comments to authenticated;

-- Storage ------------------------------------------------------------------

-- Proofs are uploaded with signed upload links and served with signed links of 15 minutes
-- (SEC-31); there are no policies on storage.objects for this bucket.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'proofs', 'proofs', false, 52428800,
      array['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm']
    )
    on conflict (id) do nothing;
  end if;
end;
$$;

-- The portal shows the project's revision limit next to the rounds already used (RF-073).
create or replace view public.portal_projects with (security_barrier = true) as
  select p.id, p.client_id, p.name, p.status, p.starts_on, p.ends_on, p.created_at,
         p.revision_limit
  from public.projects p
  where p.status <> 'cancelled'
    and app.is_client_member(
      p.client_id, array['decision_maker', 'operational']::app.client_role[]
    );
