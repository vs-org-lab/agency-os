-- A proposal reaches the client only through the founder's send (08 Segurança): a new row is
-- always a draft, so authenticated users insert only the draft's own columns.
revoke insert on table public.proposals from authenticated;--> statement-breakpoint
grant insert (
  organization_id, client_id, deal_id, legal_entity_id, currency, locale, valid_until, guarantee,
  author_id
) on table public.proposals to authenticated;--> statement-breakpoint
-- Sending (draft → sent) and withdrawing (sent → draft): the founder's check, the row lock and
-- the change happen together in the caller's own transaction, so the audit names the founder.
create or replace function app.set_proposal_status(
  p_proposal uuid,
  p_from app.proposal_status,
  p_to app.proposal_status
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_organization uuid;
begin
  if not ((p_from = 'draft' and p_to = 'sent') or (p_from = 'sent' and p_to = 'draft')) then
    raise exception 'Unsupported proposal status change from % to %', p_from, p_to;
  end if;
  select organization_id into v_organization
  from public.proposals where id = p_proposal
  for update;
  if v_organization is null
     or not app.is_mfa_verified()
     or not app.has_org_role(v_organization, array['founder']::app.org_role[]) then
    return false;
  end if;
  update public.proposals
  set status = p_to,
      sent_at = case when p_to = 'sent' then now() end,
      updated_at = now()
  where id = p_proposal and status = p_from;
  return found;
end;
$$;--> statement-breakpoint
revoke execute on function app.set_proposal_status(uuid, app.proposal_status, app.proposal_status)
  from public, anon;--> statement-breakpoint
grant execute on function app.set_proposal_status(uuid, app.proposal_status, app.proposal_status)
  to authenticated;
