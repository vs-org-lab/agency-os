-- Commercial access: privileges, pipeline access functions, stage history and row level security.

-- Privileges ---------------------------------------------------------------

revoke all on table
  public.contacts,
  public.application_forms,
  public.applications,
  public.deals,
  public.deal_stage_changes,
  public.calls,
  public.follow_ups,
  public.timeline_entries,
  public.message_templates,
  public.acquisition_targets,
  public.calendar_connections,
  public.commercial_settings,
  public.submission_throttle,
  public.captured_emails
from anon, authenticated, service_role;

grant update (website, revenue_band, lifecycle) on table public.clients to authenticated;

grant select, insert on table public.contacts to authenticated;
grant update (full_name, email, phone, job_title, role, portal_user_id, archived_at, updated_at)
  on table public.contacts to authenticated;

grant select on table public.applications to authenticated;
grant select on table public.deal_stage_changes to authenticated;

grant select, insert on table public.deals to authenticated;
grant update (
  title, pipeline_code, next_step, next_step_owner_kind, next_step_owner_user_id,
  next_step_due_on, estimated_value, currency, lost_reason, archived_at, updated_at
) on table public.deals to authenticated;

grant select, insert on table public.calls to authenticated;
grant update (
  starts_at, ends_at, status, sync_status, external_event_id, meet_url, outcome,
  outcome_reason, notes, updated_at
) on table public.calls to authenticated;

grant select, insert on table public.follow_ups to authenticated;
grant update (status, assigned_to, completed_at, updated_at)
  on table public.follow_ups to authenticated;

grant select, insert on table public.timeline_entries to authenticated;

grant select, insert on table public.application_forms to authenticated;
grant update (is_active, updated_at) on table public.application_forms to authenticated;

grant select, insert on table public.commercial_settings to authenticated;
grant update (
  time_zone, weekly_hours, duration_minutes, buffer_minutes, minimum_notice_hours,
  horizon_days, host_user_id, self_diagnosis_url, anonymize_after_months, updated_at
) on table public.commercial_settings to authenticated;

grant select, insert on table public.message_templates to authenticated;
grant update (sector, sequence_day, locale, name, subject, body, archived_at, updated_at)
  on table public.message_templates to authenticated;

grant select, insert on table public.acquisition_targets to authenticated;
grant update (company_name, sector, website, notes, status, converted_client_id, archived_at, updated_at)
  on table public.acquisition_targets to authenticated;

grant select on table public.calendar_connections to authenticated;

-- Access functions ---------------------------------------------------------

create or replace function app.can_read_pipeline(p_organization uuid, p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_org_role(p_organization, array['founder', 'finance']::app.org_role[])
    or (
      p_client is not null
      and app.has_org_role(p_organization, array['project_manager']::app.org_role[])
      and app.is_assigned_staff(p_client)
    );
$$;

create or replace function app.can_write_pipeline(p_organization uuid, p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_org_role(p_organization, array['founder']::app.org_role[])
    or (
      p_client is not null
      and app.has_org_role(p_organization, array['project_manager']::app.org_role[])
      and app.is_assigned_staff(p_client)
    );
$$;

revoke execute on function app.can_read_pipeline(uuid, uuid) from public, anon;
revoke execute on function app.can_write_pipeline(uuid, uuid) from public, anon;
grant execute on function app.can_read_pipeline(uuid, uuid) to authenticated;
grant execute on function app.can_write_pipeline(uuid, uuid) to authenticated;

-- Stage history ------------------------------------------------------------

create or replace function app.record_deal_stage_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.pipeline_code is not distinct from old.pipeline_code then
    return new;
  end if;

  insert into public.deal_stage_changes (
    organization_id, client_id, deal_id, from_code, to_code, reason, actor_user_id
  ) values (
    new.organization_id,
    new.client_id,
    new.id,
    case when tg_op = 'UPDATE' then old.pipeline_code else null end,
    new.pipeline_code,
    nullif(current_setting('app.stage_change_reason', true), ''),
    (select auth.uid())
  );
  return new;
end;
$$;

revoke execute on function app.record_deal_stage_change() from public, anon, authenticated;

create trigger deals_record_stage_change
  after insert or update of pipeline_code on public.deals
  for each row execute function app.record_deal_stage_change();

create or replace function app.reject_append_only_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger deal_stage_changes_reject_update_delete
  before update or delete on public.deal_stage_changes
  for each row execute function app.reject_append_only_change();
create trigger deal_stage_changes_reject_truncate
  before truncate on public.deal_stage_changes
  for each statement execute function app.reject_append_only_change();
create trigger timeline_entries_reject_update_delete
  before update or delete on public.timeline_entries
  for each row execute function app.reject_append_only_change();
create trigger timeline_entries_reject_truncate
  before truncate on public.timeline_entries
  for each statement execute function app.reject_append_only_change();

-- Row level security -------------------------------------------------------

alter table public.contacts force row level security;
alter table public.application_forms force row level security;
alter table public.applications force row level security;
alter table public.deals force row level security;
alter table public.deal_stage_changes force row level security;
alter table public.calls force row level security;
alter table public.follow_ups force row level security;
alter table public.timeline_entries force row level security;
alter table public.message_templates force row level security;
alter table public.acquisition_targets force row level security;
alter table public.calendar_connections force row level security;
alter table public.commercial_settings force row level security;
alter table public.submission_throttle force row level security;
alter table public.captured_emails force row level security;

create policy contacts_select on public.contacts
  for select to authenticated using (app.can_read_pipeline(organization_id, client_id));
create policy contacts_insert on public.contacts
  for insert to authenticated with check (app.can_write_pipeline(organization_id, client_id));
create policy contacts_update on public.contacts
  for update to authenticated
  using (app.can_write_pipeline(organization_id, client_id))
  with check (app.can_write_pipeline(organization_id, client_id));

create policy deals_select on public.deals
  for select to authenticated using (app.can_read_pipeline(organization_id, client_id));
create policy deals_insert on public.deals
  for insert to authenticated with check (app.can_write_pipeline(organization_id, client_id));
create policy deals_update on public.deals
  for update to authenticated
  using (app.can_write_pipeline(organization_id, client_id))
  with check (app.can_write_pipeline(organization_id, client_id));

create policy calls_select on public.calls
  for select to authenticated using (app.can_read_pipeline(organization_id, client_id));
create policy calls_insert on public.calls
  for insert to authenticated with check (app.can_write_pipeline(organization_id, client_id));
create policy calls_update on public.calls
  for update to authenticated
  using (app.can_write_pipeline(organization_id, client_id))
  with check (app.can_write_pipeline(organization_id, client_id));

create policy follow_ups_select on public.follow_ups
  for select to authenticated using (app.can_read_pipeline(organization_id, client_id));
create policy follow_ups_insert on public.follow_ups
  for insert to authenticated with check (app.can_write_pipeline(organization_id, client_id));
create policy follow_ups_update on public.follow_ups
  for update to authenticated
  using (app.can_write_pipeline(organization_id, client_id))
  with check (app.can_write_pipeline(organization_id, client_id));

create policy applications_select on public.applications
  for select to authenticated using (app.can_read_pipeline(organization_id, client_id));

create policy deal_stage_changes_select on public.deal_stage_changes
  for select to authenticated using (app.can_read_pipeline(organization_id, client_id));

create policy timeline_entries_select on public.timeline_entries
  for select to authenticated using (app.can_read_pipeline(organization_id, client_id));
create policy timeline_entries_insert on public.timeline_entries
  for insert to authenticated with check (app.can_write_pipeline(organization_id, client_id));

create policy acquisition_targets_select on public.acquisition_targets
  for select to authenticated
  using (app.has_org_role(organization_id, array['founder', 'finance']::app.org_role[]));
create policy acquisition_targets_insert on public.acquisition_targets
  for insert to authenticated
  with check (app.has_org_role(organization_id, array['founder']::app.org_role[]));
create policy acquisition_targets_update on public.acquisition_targets
  for update to authenticated
  using (app.has_org_role(organization_id, array['founder']::app.org_role[]))
  with check (app.has_org_role(organization_id, array['founder']::app.org_role[]));

create policy application_forms_founder on public.application_forms
  for all to authenticated
  using (app.has_org_role(organization_id, array['founder']::app.org_role[]))
  with check (app.has_org_role(organization_id, array['founder']::app.org_role[]));

create policy commercial_settings_founder on public.commercial_settings
  for all to authenticated
  using (app.has_org_role(organization_id, array['founder']::app.org_role[]))
  with check (app.has_org_role(organization_id, array['founder']::app.org_role[]));

create policy message_templates_founder on public.message_templates
  for all to authenticated
  using (app.has_org_role(organization_id, array['founder']::app.org_role[]))
  with check (app.has_org_role(organization_id, array['founder']::app.org_role[]));

create policy calendar_connections_select_own on public.calendar_connections
  for select to authenticated using (user_id = (select auth.uid()));

create policy submission_throttle_no_user_access on public.submission_throttle
  for all to authenticated using (false) with check (false);

create policy captured_emails_no_user_access on public.captured_emails
  for all to authenticated using (false) with check (false);
