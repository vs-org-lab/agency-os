-- Append-only audit log: no updates, deletes or truncation by any role; inserts through app.record_audit.

revoke insert, update, delete, truncate on table public.audit_log
  from public, anon, authenticated, service_role;

create or replace function app.reject_audit_log_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_reject_update_delete
  before update or delete on public.audit_log
  for each row execute function app.reject_audit_log_change();

create trigger audit_log_reject_truncate
  before truncate on public.audit_log
  for each statement execute function app.reject_audit_log_change();

create or replace function app.record_audit(
  p_organization uuid,
  p_action text,
  p_resource_type text,
  p_resource_id uuid,
  p_client uuid,
  p_metadata jsonb,
  p_ip inet,
  p_user_agent text,
  p_actor_kind app.actor_kind
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_kind app.actor_kind;
  v_id uuid;
begin
  if v_actor is null then
    v_kind := 'system';
  else
    if not exists (
      select 1 from public.organization_memberships m
      where m.organization_id = p_organization
        and m.user_id = v_actor
        and m.status in ('active', 'invited')
        and m.archived_at is null
    ) and not exists (
      select 1 from public.client_memberships cm
      where cm.organization_id = p_organization
        and cm.user_id = v_actor
        and cm.status in ('active', 'invited')
        and cm.archived_at is null
    ) then
      raise exception 'Caller is not a member of the organization'
        using errcode = 'insufficient_privilege';
    end if;
    v_kind := case when p_actor_kind = 'agent' then 'agent'::app.actor_kind else 'user'::app.actor_kind end;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, resource_type, resource_id,
    client_id, metadata, ip_address, user_agent
  )
  values (
    p_organization, v_actor, v_kind, p_action, p_resource_type, p_resource_id,
    p_client, coalesce(p_metadata, '{}'::jsonb), p_ip, p_user_agent
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function app.record_audit(uuid, text, text, uuid, uuid, jsonb, inet, text, app.actor_kind)
  from public, anon;
grant execute on function app.record_audit(uuid, text, text, uuid, uuid, jsonb, inet, text, app.actor_kind)
  to authenticated;
revoke execute on function app.reject_audit_log_change() from public, anon, authenticated;
