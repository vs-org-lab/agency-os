-- Queue B review: staff who can write the pipeline record the review decision on an application.

grant update (review_decision, reviewed_at, reviewed_by, updated_at)
  on table public.applications to authenticated;

create policy applications_update_review on public.applications
  for update to authenticated
  using (app.can_write_pipeline(organization_id, client_id))
  with check (app.can_write_pipeline(organization_id, client_id));
