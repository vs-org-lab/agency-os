-- Only the founder sends a proposal, so what the client receives is what the founder sent: pipeline
-- writers edit a proposal and its options only while it is a draft. Status changes go through
-- app.set_proposal_status, which runs as its owner and is not bound by these policies.
drop policy proposals_update on public.proposals;--> statement-breakpoint
create policy proposals_update on public.proposals
  for update to authenticated
  using (app.can_write_pipeline(organization_id, client_id) and status = 'draft')
  with check (app.can_write_pipeline(organization_id, client_id) and status = 'draft');--> statement-breakpoint
drop policy proposal_options_insert on public.proposal_options;--> statement-breakpoint
create policy proposal_options_insert on public.proposal_options
  for insert to authenticated
  with check (
    app.can_write_pipeline(organization_id, client_id)
    and exists (
      select 1 from public.proposals p where p.id = proposal_id and p.status = 'draft'
    )
  );--> statement-breakpoint
drop policy proposal_options_update on public.proposal_options;--> statement-breakpoint
create policy proposal_options_update on public.proposal_options
  for update to authenticated
  using (
    app.can_write_pipeline(organization_id, client_id)
    and exists (
      select 1 from public.proposals p where p.id = proposal_id and p.status = 'draft'
    )
  )
  with check (
    app.can_write_pipeline(organization_id, client_id)
    and exists (
      select 1 from public.proposals p where p.id = proposal_id and p.status = 'draft'
    )
  );--> statement-breakpoint
drop policy proposal_options_delete on public.proposal_options;--> statement-breakpoint
create policy proposal_options_delete on public.proposal_options
  for delete to authenticated
  using (
    app.can_write_pipeline(organization_id, client_id)
    and exists (
      select 1 from public.proposals p where p.id = proposal_id and p.status = 'draft'
    )
  );
