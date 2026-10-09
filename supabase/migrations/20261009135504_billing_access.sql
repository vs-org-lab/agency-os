-- Billing access: privileges, staff row level security, client portal views and the billing
-- bucket. Every write (plans, payment requests, payments, legal invoices) runs in server services
-- that authorise the caller and write as the system, so authenticated users only read.

-- Privileges ---------------------------------------------------------------

revoke all on table
  public.billing_counters,
  public.billing_milestones,
  public.payment_requests,
  public.payments,
  public.legal_invoices
from anon, authenticated, service_role;

grant select on table
  public.billing_milestones,
  public.payment_requests,
  public.payments,
  public.legal_invoices
to authenticated;

grant update (bank_name, iban, bic, payment_instructions)
  on table public.legal_entities to authenticated;

-- Access functions ---------------------------------------------------------

-- Invoices in the access matrix: founder, finance and project managers read every client.
create or replace function app.can_read_billing(p_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_org_role(
    p_organization, array['founder', 'finance', 'project_manager']::app.org_role[]
  );
$$;

create or replace function app.can_write_billing(p_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_org_role(p_organization, array['founder', 'finance']::app.org_role[]);
$$;

revoke execute on function app.can_read_billing(uuid) from public, anon;
revoke execute on function app.can_write_billing(uuid) from public, anon;
grant execute on function app.can_read_billing(uuid) to authenticated;
grant execute on function app.can_write_billing(uuid) to authenticated;

-- Row level security --------------------------------------------------------

alter table public.billing_counters force row level security;
alter table public.billing_milestones force row level security;
alter table public.payment_requests force row level security;
alter table public.payments force row level security;
alter table public.legal_invoices force row level security;

create policy billing_milestones_select on public.billing_milestones
  for select to authenticated using (app.can_read_billing(organization_id));

create policy payment_requests_select on public.payment_requests
  for select to authenticated using (app.can_read_billing(organization_id));

create policy payments_select on public.payments
  for select to authenticated using (app.can_read_billing(organization_id));

create policy legal_invoices_select on public.legal_invoices
  for select to authenticated using (app.can_read_billing(organization_id));

-- Portal views -------------------------------------------------------------------

-- The decision maker and the client's finance contacts read their own sent and paid requests.
-- The views run with their owner's privileges, so they expose the shareable columns only and
-- filter rows themselves.
create view public.portal_payment_requests with (security_barrier = true) as
  select r.id, r.organization_id, r.client_id, r.deal_id, r.number, r.label, r.amount, r.currency,
         r.locale, r.due_date, r.status, r.issuer_details, r.client_details, r.sent_at, r.paid_at,
         r.pdf_path is not null as pdf_available
  from public.payment_requests r
  where r.status in ('sent', 'paid')
    and app.is_client_member(
      r.client_id, array['decision_maker', 'client_finance']::app.client_role[]
    );

create view public.portal_legal_invoices with (security_barrier = true) as
  select i.id, i.client_id, i.request_id, i.issuer, i.number, i.issued_on
  from public.legal_invoices i
  join public.payment_requests r on r.id = i.request_id
  where r.status = 'paid'
    and app.is_client_member(
      i.client_id, array['decision_maker', 'client_finance']::app.client_role[]
    );

revoke all on table public.portal_payment_requests, public.portal_legal_invoices
  from anon, authenticated, service_role;
grant select on table public.portal_payment_requests, public.portal_legal_invoices
  to authenticated;

-- Billing bucket -------------------------------------------------------------------

-- The local CI database starts without the Storage API, so the bucket is created only where the
-- storage schema exists. Request PDFs are written by the server; legal invoice PDFs arrive through
-- short-lived signed upload URLs issued after authorisation.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('billing', 'billing', false, 10485760, array['application/pdf'])
    on conflict (id) do nothing;
  end if;
end;
$$;
