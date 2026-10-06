-- Domain events are written by app.emit_event in the caller's transaction (outbox pattern).

create or replace function app.emit_event(
  p_organization uuid,
  p_client uuid,
  p_type text,
  p_payload jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
begin
  if v_actor is not null
    and not exists (
      select 1 from public.organization_memberships m
      where m.organization_id = p_organization
        and m.user_id = v_actor
        and m.status in ('active', 'invited')
        and m.archived_at is null
    )
    and not exists (
      select 1 from public.client_memberships cm
      where cm.organization_id = p_organization
        and cm.user_id = v_actor
        and cm.status in ('active', 'invited')
        and cm.archived_at is null
    )
  then
    raise exception 'Caller is not a member of the organization'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.domain_events (organization_id, client_id, type, payload)
  values (p_organization, p_client, p_type, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function app.emit_event(uuid, uuid, text, jsonb) from public, anon;
grant execute on function app.emit_event(uuid, uuid, text, jsonb) to authenticated;
