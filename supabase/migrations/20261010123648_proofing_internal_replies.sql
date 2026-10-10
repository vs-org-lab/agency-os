-- RN-23: replies inside an internal thread never reach the client, even when stored as public.
create or replace view public.portal_proof_comments with (security_barrier = true) as
  select c.id, c.client_id, c.project_id, c.version_id, c.parent_id, c.body, c.anchor, c.number,
         c.resolved_at, c.created_at, c.author_id, pr.full_name as author_name,
         pr.kind = 'client' as by_client
  from public.proof_comments c
  join public.portal_proof_versions v on v.id = c.version_id
  left join public.profiles pr on pr.id = c.author_id
  where not c.internal
    and not exists (
      select 1 from public.proof_comments parent
      where parent.id = c.parent_id and parent.internal
    );
