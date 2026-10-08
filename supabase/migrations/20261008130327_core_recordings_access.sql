-- Core call recordings access: privileges, staff row level security and the recordings bucket.

revoke all on table public.core_recordings from anon, authenticated, service_role;

grant select, insert on table public.core_recordings to authenticated;
grant update (status, error, updated_at) on table public.core_recordings to authenticated;

alter table public.core_recordings force row level security;

-- Client users have no policy: recordings and their audio never reach the portal.
create policy core_recordings_select on public.core_recordings
  for select to authenticated using (app.can_read_pipeline(organization_id, client_id));
create policy core_recordings_insert on public.core_recordings
  for insert to authenticated with check (app.can_write_pipeline(organization_id, client_id));
create policy core_recordings_update on public.core_recordings
  for update to authenticated
  using (app.can_write_pipeline(organization_id, client_id))
  with check (app.can_write_pipeline(organization_id, client_id));

-- The local CI database starts without the Storage API, so the bucket is created only where
-- the storage schema exists. Uploads use signed upload URLs issued by the server and reads are
-- server-side only; there are no policies on storage.objects for this bucket.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'core-recordings', 'core-recordings', false, 26214400,
      array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a']
    )
    on conflict (id) do nothing;
  end if;
end;
$$;
