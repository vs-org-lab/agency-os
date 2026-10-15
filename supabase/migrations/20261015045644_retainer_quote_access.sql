-- An extra request's quote is a value the access matrix keeps from freelancers and from the
-- client's operational users: staff read it through the service after authorisation, and the
-- portal view shows it to the client's decision maker only.
revoke select on table public.retainer_extra_requests from authenticated;--> statement-breakpoint
grant select (id, organization_id, client_id, retainer_id, kind, description, quantity, status,
  requested_by, approval_id, task_id, created_at, updated_at)
on table public.retainer_extra_requests to authenticated;--> statement-breakpoint
drop view public.portal_retainer_extra_requests;--> statement-breakpoint
create view public.portal_retainer_extra_requests with (security_barrier = true) as
  select e.id, e.retainer_id, e.client_id, e.kind, e.description, e.quantity,
         case when app.is_client_member(e.client_id, array['decision_maker']::app.client_role[])
           then e.quote_amount end as quote_amount,
         case when app.is_client_member(e.client_id, array['decision_maker']::app.client_role[])
           then e.currency end as currency,
         e.status, e.created_at, e.updated_at
  from public.retainer_extra_requests e
  where app.is_client_member(
    e.client_id, array['decision_maker', 'operational']::app.client_role[]
  );--> statement-breakpoint
revoke all on public.portal_retainer_extra_requests from anon, service_role;--> statement-breakpoint
grant select on public.portal_retainer_extra_requests to authenticated;
