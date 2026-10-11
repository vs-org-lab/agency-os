-- A document that was approved stays in the portal after a new version reopens it in draft, so
-- the client keeps reading the approved version (RN-20); the new version stays hidden until it is
-- shared.
create or replace view public.portal_project_documents with (security_barrier = true) as
  select d.id, d.client_id, d.project_id, d.title, d.kind, d.status, d.current_version_id,
         d.shared_at, d.approved_at, d.updated_at
  from public.project_documents d
  join public.projects p on p.id = d.project_id
  where (d.status in ('with_client', 'approved') or d.approved_at is not null)
    and p.status <> 'cancelled'
    and app.is_client_member(
      d.client_id, array['decision_maker', 'operational']::app.client_role[]
    );
