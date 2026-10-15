-- Receipts follow their payment request into the portal only while the request is visible there
-- (sent or paid), and the view no longer exposes storage paths: the receipt route resolves the
-- path on the server once the view has confirmed access.
drop view public.portal_payment_request_receipts;--> statement-breakpoint
create view public.portal_payment_request_receipts with (security_barrier = true) as
  select e.id as expense_id, e.payment_request_id, e.client_id, e.receipt_name
  from public.expenses e
  join public.payment_requests r
    on r.id = e.payment_request_id and r.status in ('sent', 'paid')
  where e.receipt_path is not null
    and app.is_client_member(
      e.client_id, array['decision_maker', 'client_finance']::app.client_role[]
    );--> statement-breakpoint
revoke all on public.portal_payment_request_receipts from anon, service_role;--> statement-breakpoint
grant select on public.portal_payment_request_receipts to authenticated;
