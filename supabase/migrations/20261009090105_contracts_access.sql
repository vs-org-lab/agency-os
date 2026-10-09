-- Contracts access: privileges, staff row level security, decision maker portal views and the
-- signed contracts bucket. Client-side writes (acceptance, change requests, signatures) and
-- contract generation run in server services that authorise the caller and write as the system.

-- Privileges ---------------------------------------------------------------

revoke all on table
  public.legal_entities,
  public.contract_templates,
  public.proposals,
  public.proposal_options,
  public.proposal_requests,
  public.contracts,
  public.contract_signatures
from anon, authenticated, service_role;

grant select, insert on table public.legal_entities to authenticated;
grant update (
  legal_name, tax_id, address, country, email, representative_name, representative_role,
  is_default, archived_at, updated_at
) on table public.legal_entities to authenticated;

grant select, insert on table public.contract_templates to authenticated;
grant update (is_active) on table public.contract_templates to authenticated;

grant select, insert on table public.proposals to authenticated;
grant update (
  legal_entity_id, currency, locale, valid_until, guarantee, status, sent_at, author_id, updated_at
) on table public.proposals to authenticated;

grant select, insert, delete on table public.proposal_options to authenticated;
grant update (
  position, name, summary, scope, one_off_amount, payment_plan, retainer_monthly, retainer_months,
  updated_at
) on table public.proposal_options to authenticated;

grant select on table public.proposal_requests to authenticated;
grant select on table public.contracts to authenticated;
grant select on table public.contract_signatures to authenticated;

-- Row level security --------------------------------------------------------

alter table public.legal_entities force row level security;
alter table public.contract_templates force row level security;
alter table public.proposals force row level security;
alter table public.proposal_options force row level security;
alter table public.proposal_requests force row level security;
alter table public.contracts force row level security;
alter table public.contract_signatures force row level security;

create policy legal_entities_select on public.legal_entities
  for select to authenticated
  using (
    app.has_org_role(organization_id, array['founder', 'project_manager', 'finance']::app.org_role[])
  );
create policy legal_entities_insert on public.legal_entities
  for insert to authenticated
  with check (app.has_org_role(organization_id, array['founder']::app.org_role[]));
create policy legal_entities_update on public.legal_entities
  for update to authenticated
  using (app.has_org_role(organization_id, array['founder']::app.org_role[]))
  with check (app.has_org_role(organization_id, array['founder']::app.org_role[]));

create policy contract_templates_select on public.contract_templates
  for select to authenticated
  using (
    app.has_org_role(organization_id, array['founder', 'project_manager', 'finance']::app.org_role[])
  );
create policy contract_templates_insert on public.contract_templates
  for insert to authenticated
  with check (app.has_org_role(organization_id, array['founder']::app.org_role[]));
create policy contract_templates_update on public.contract_templates
  for update to authenticated
  using (app.has_org_role(organization_id, array['founder']::app.org_role[]))
  with check (app.has_org_role(organization_id, array['founder']::app.org_role[]));

create policy proposals_select on public.proposals
  for select to authenticated using (app.can_read_pipeline(organization_id, client_id));
create policy proposals_insert on public.proposals
  for insert to authenticated with check (app.can_write_pipeline(organization_id, client_id));
create policy proposals_update on public.proposals
  for update to authenticated
  using (app.can_write_pipeline(organization_id, client_id))
  with check (app.can_write_pipeline(organization_id, client_id));

create policy proposal_options_select on public.proposal_options
  for select to authenticated using (app.can_read_pipeline(organization_id, client_id));
create policy proposal_options_insert on public.proposal_options
  for insert to authenticated with check (app.can_write_pipeline(organization_id, client_id));
create policy proposal_options_update on public.proposal_options
  for update to authenticated
  using (app.can_write_pipeline(organization_id, client_id))
  with check (app.can_write_pipeline(organization_id, client_id));
create policy proposal_options_delete on public.proposal_options
  for delete to authenticated using (app.can_write_pipeline(organization_id, client_id));

create policy proposal_requests_select on public.proposal_requests
  for select to authenticated using (app.can_read_pipeline(organization_id, client_id));

create policy contracts_select on public.contracts
  for select to authenticated using (app.can_read_pipeline(organization_id, client_id));

create policy contract_signatures_select on public.contract_signatures
  for select to authenticated using (app.can_read_pipeline(organization_id, client_id));

-- Portal views -------------------------------------------------------------------

-- Only the decision maker of the client reads proposals and contracts. The views run with their
-- owner's privileges, so they expose the shareable columns only and filter rows themselves.
create view public.portal_proposals with (security_barrier = true) as
  select p.id, p.organization_id, p.client_id, p.deal_id, p.currency, p.locale, p.valid_until,
         p.guarantee, p.status, p.sent_at, p.accepted_at, p.accepted_option_id,
         e.legal_name as entity_name
  from public.proposals p
  join public.legal_entities e on e.id = p.legal_entity_id
  where p.status in ('sent', 'accepted')
    and app.is_client_member(p.client_id, array['decision_maker']::app.client_role[]);

create view public.portal_proposal_options with (security_barrier = true) as
  select o.id, o.proposal_id, o.position, o.name, o.summary, o.scope, o.one_off_amount,
         o.payment_plan, o.retainer_monthly, o.retainer_months
  from public.proposal_options o
  join public.proposals p on p.id = o.proposal_id
  where p.status in ('sent', 'accepted')
    and app.is_client_member(p.client_id, array['decision_maker']::app.client_role[]);

create view public.portal_contracts with (security_barrier = true) as
  select c.id, c.client_id, c.deal_id, c.proposal_id, c.option_id, c.locale, c.body, c.body_hash,
         c.status, c.signed_at, c.created_at,
         (select s.signed_at from public.contract_signatures s
           where s.contract_id = c.id and s.party = 'client') as client_signed_at,
         (select s.signed_at from public.contract_signatures s
           where s.contract_id = c.id and s.party = 'studio') as studio_signed_at
  from public.contracts c
  where c.status <> 'void'
    and app.is_client_member(c.client_id, array['decision_maker']::app.client_role[]);

revoke all on table public.portal_proposals, public.portal_proposal_options, public.portal_contracts
  from anon, authenticated, service_role;
grant select on table public.portal_proposals, public.portal_proposal_options, public.portal_contracts
  to authenticated;

-- Signed contracts bucket ------------------------------------------------------------

-- The local CI database starts without the Storage API, so the bucket is created only where the
-- storage schema exists. Signed PDFs are written and read only by the server.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('contracts', 'contracts', false, 10485760, array['application/pdf'])
    on conflict (id) do nothing;
  end if;
end;
$$;
