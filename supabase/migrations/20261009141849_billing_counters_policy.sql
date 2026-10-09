-- Request numbering is written only by the billing services; the policy keeps the forced row level
-- security explicit even though authenticated users hold no privilege on the table.
create policy billing_counters_select on public.billing_counters
  for select to authenticated using (app.can_write_billing(organization_id));
