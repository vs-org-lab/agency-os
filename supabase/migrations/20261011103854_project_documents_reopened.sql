-- A document reopened in draft after an approval shows the client the approved version, marked
-- approved (RN-20); the drafted version stays hidden until it is shared. Documents approved before
-- this change keep their approved version through the approval rows.
update public.project_documents d
set approved_version_id = (
  select a.subject_id from public.approvals a
  join public.project_document_versions v on v.id = a.subject_id
  where a.subject_type = 'document_version' and a.status = 'approved' and v.document_id = d.id
  order by a.decided_at desc nulls last
  limit 1
)
where d.approved_at is not null and d.approved_version_id is null;

create or replace view public.portal_project_documents with (security_barrier = true) as
  select d.id, d.client_id, d.project_id, d.title, d.kind,
         case when d.status = 'draft' then 'approved'::app.project_document_status
              else d.status end as status,
         case when d.status = 'draft' then d.approved_version_id
              else d.current_version_id end as current_version_id,
         d.shared_at, d.approved_at, d.updated_at
  from public.project_documents d
  join public.projects p on p.id = d.project_id
  where (d.status in ('with_client', 'approved') or d.approved_version_id is not null)
    and p.status <> 'cancelled'
    and app.is_client_member(
      d.client_id, array['decision_maker', 'operational']::app.client_role[]
    );
