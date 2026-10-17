-- The ORM names every column of an insert, defaults included, so a column-level insert grant
-- refuses ordinary drafts. The table-level grant comes back and the policy keeps every new row a
-- draft that nobody has sent or accepted yet.
revoke insert on table public.proposals from authenticated;--> statement-breakpoint
grant insert on table public.proposals to authenticated;--> statement-breakpoint
drop policy proposals_insert on public.proposals;--> statement-breakpoint
create policy proposals_insert on public.proposals
  for insert to authenticated
  with check (
    app.can_write_pipeline(organization_id, client_id)
    and status = 'draft'
    and sent_at is null
    and accepted_at is null
    and accepted_by is null
    and accepted_option_id is null
  );
