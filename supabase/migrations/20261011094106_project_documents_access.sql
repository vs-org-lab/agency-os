-- Room documents access: the room team reads the documents of the projects it may read (RN-51);
-- the client's decision maker and operational users read, through views, only shared or approved
-- documents, the versions shown to them and comments that are not internal (RN-23). Every write
-- runs in server services.

-- Privileges ---------------------------------------------------------------

revoke all on table public.project_documents, public.project_document_versions,
  public.project_document_comments
from anon, authenticated, service_role;
grant select on table public.project_documents, public.project_document_versions,
  public.project_document_comments
to authenticated;

-- Row level security --------------------------------------------------------

alter table public.project_documents force row level security;
alter table public.project_document_versions force row level security;
alter table public.project_document_comments force row level security;

create policy project_documents_select on public.project_documents
  for select to authenticated using (app.can_read_project(organization_id, client_id, project_id));

create policy project_document_versions_select on public.project_document_versions
  for select to authenticated using (app.can_read_project(organization_id, client_id, project_id));

create policy project_document_comments_select on public.project_document_comments
  for select to authenticated using (app.can_read_project(organization_id, client_id, project_id));

-- Portal views -------------------------------------------------------------

create view public.portal_project_documents with (security_barrier = true) as
  select d.id, d.client_id, d.project_id, d.title, d.kind, d.status, d.current_version_id,
         d.shared_at, d.approved_at, d.updated_at
  from public.project_documents d
  join public.projects p on p.id = d.project_id
  where d.status in ('with_client', 'approved')
    and p.status <> 'cancelled'
    and app.is_client_member(
      d.client_id, array['decision_maker', 'operational']::app.client_role[]
    );

create view public.portal_project_document_versions with (security_barrier = true) as
  select v.id, v.document_id, v.client_id, v.project_id, v.number, v.kind, v.url, v.file_name,
         v.mime_type, v.size_bytes, v.pages, v.shared_at, v.created_at
  from public.project_document_versions v
  join public.portal_project_documents d on d.id = v.document_id
  where v.shared_at is not null and v.upload_status = 'ready';

create view public.portal_project_document_comments with (security_barrier = true) as
  select c.id, c.document_id, c.version_id, c.client_id, c.project_id, c.body, c.created_at,
         c.author_id, pr.full_name as author_name, pr.kind = 'client' as by_client
  from public.project_document_comments c
  join public.portal_project_document_versions v on v.id = c.version_id
  left join public.profiles pr on pr.id = c.author_id
  where not c.internal;

revoke all on table public.portal_project_documents, public.portal_project_document_versions,
  public.portal_project_document_comments
from anon, authenticated, service_role;
grant select on table public.portal_project_documents, public.portal_project_document_versions,
  public.portal_project_document_comments
to authenticated;
