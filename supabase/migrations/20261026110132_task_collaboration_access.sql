-- Task collaboration access: comments, linked library files and links are read by whoever reads
-- the task. Clients never read them. Every write runs in server services that authorise the caller.

revoke all on table public.task_comments, public.task_files, public.task_links
  from anon, authenticated, service_role;
grant select on table public.task_comments, public.task_files, public.task_links to authenticated;

alter table public.task_comments force row level security;
alter table public.task_files force row level security;
alter table public.task_links force row level security;

create policy task_comments_select on public.task_comments
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_comments.task_id
        and app.can_read_task(t.organization_id, t.client_id, t.project_id, t.assignee_id)
    )
  );

create policy task_files_select on public.task_files
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_files.task_id
        and app.can_read_task(t.organization_id, t.client_id, t.project_id, t.assignee_id)
    )
  );

create policy task_links_select on public.task_links
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_links.task_id
        and app.can_read_task(t.organization_id, t.client_id, t.project_id, t.assignee_id)
    )
  );
