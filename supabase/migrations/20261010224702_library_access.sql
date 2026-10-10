-- Library access: the room team reads the library of the projects it may read (RN-51); the
-- client's decision maker and operational users read, through views, only folders and ready files
-- under a root folder made visible to the client, and the attachments of client-visible updates
-- that come from them. Every write runs in server services.

-- Privileges ---------------------------------------------------------------

revoke all on table public.library_folders, public.library_files, public.project_update_files
from anon, authenticated, service_role;
grant select on table public.library_folders, public.library_files, public.project_update_files
to authenticated;

-- Row level security --------------------------------------------------------

alter table public.library_folders force row level security;
alter table public.library_files force row level security;
alter table public.project_update_files force row level security;

create policy library_folders_select on public.library_folders
  for select to authenticated using (app.can_read_project(organization_id, client_id, project_id));

create policy library_files_select on public.library_files
  for select to authenticated using (app.can_read_project(organization_id, client_id, project_id));

create policy project_update_files_select on public.project_update_files
  for select to authenticated using (app.can_read_project(organization_id, client_id, project_id));

-- Portal views -------------------------------------------------------------

create view public.portal_library_folders with (security_barrier = true) as
  select f.id, f.client_id, f.project_id, f.parent_id, f.root_id, f.depth, f.name, f.created_at
  from public.library_folders f
  join public.library_folders r on r.id = f.root_id
  join public.projects p on p.id = f.project_id
  where r.visibility = 'client'
    and p.status <> 'cancelled'
    and app.is_client_member(
      f.client_id, array['decision_maker', 'operational']::app.client_role[]
    );

create view public.portal_library_files with (security_barrier = true) as
  select fi.id, fi.client_id, fi.project_id, fi.folder_id, fi.root_id, fi.name, fi.kind,
         fi.mime_type, fi.size_bytes, fi.uploaded_by, fi.created_at,
         pr.full_name as uploaded_by_name
  from public.library_files fi
  join public.library_folders r on r.id = fi.root_id
  join public.projects p on p.id = fi.project_id
  left join public.profiles pr on pr.id = fi.uploaded_by
  where fi.status = 'ready'
    and r.visibility = 'client'
    and p.status <> 'cancelled'
    and app.is_client_member(
      fi.client_id, array['decision_maker', 'operational']::app.client_role[]
    );

create view public.portal_update_files with (security_barrier = true) as
  select uf.update_id, uf.file_id, f.client_id, f.project_id, f.name, f.kind, f.size_bytes
  from public.project_update_files uf
  join public.project_updates u on u.id = uf.update_id
  join public.portal_library_files f on f.id = uf.file_id
  where u.visibility = 'client';

revoke all on table public.portal_library_folders, public.portal_library_files,
  public.portal_update_files
from anon, authenticated, service_role;
grant select on table public.portal_library_folders, public.portal_library_files,
  public.portal_update_files
to authenticated;

-- Storage ------------------------------------------------------------------

-- Library files are uploaded with signed upload links and served with signed links of 15 minutes
-- (SEC-31); there are no policies on storage.objects for this bucket.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'library', 'library', false, 52428800,
      array[
        'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
        'video/mp4', 'video/quicktime', 'video/webm',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip', 'application/x-zip-compressed',
        'image/vnd.adobe.photoshop', 'application/octet-stream',
        'font/ttf', 'font/otf', 'font/woff', 'font/woff2'
      ]
    )
    on conflict (id) do nothing;
  end if;
end;
$$;
