-- Agenda access: internal meetings are read by the founder and project managers; a meeting with a
-- client by whoever reads that client's room; a meeting on a project by whoever reads the project.
-- Clients read no agenda events. Every write runs in server services.

revoke all on table public.agenda_events from anon, authenticated, service_role;
grant select on table public.agenda_events to authenticated;

alter table public.agenda_events force row level security;

create policy agenda_events_select on public.agenda_events
  for select to authenticated
  using (
    case
      when client_id is null then
        app.has_org_role(organization_id, array['founder', 'project_manager']::app.org_role[])
      when project_id is null then app.can_read_rooms(organization_id, client_id)
      else app.can_read_project(organization_id, client_id, project_id)
    end
  );
