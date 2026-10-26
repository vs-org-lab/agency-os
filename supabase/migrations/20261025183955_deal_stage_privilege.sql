-- A deal's stage moves only through the pipeline service, where the RN rules and their criteria
-- live (RN-02 to RN-04); the Data API cannot set it, and a new deal always starts at 0.1.
revoke update (pipeline_code) on table public.deals from authenticated;--> statement-breakpoint
drop policy deals_insert on public.deals;--> statement-breakpoint
create policy deals_insert on public.deals
  for insert to authenticated
  with check (app.can_write_pipeline(organization_id, client_id) and pipeline_code = '0.1');
