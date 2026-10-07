-- Calendar refresh tokens live in Supabase Vault; only the system context can store, read or delete them.

create or replace function app.store_calendar_secret(p_connection uuid, p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  select vault_secret_id into v_secret_id
  from public.calendar_connections
  where id = p_connection
  for update;

  if not found then
    raise exception 'calendar connection % does not exist', p_connection;
  end if;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_secret, 'calendar_connection:' || p_connection::text, 'Calendar refresh token');
    update public.calendar_connections set vault_secret_id = v_secret_id where id = p_connection;
  else
    perform vault.update_secret(v_secret_id, p_secret);
  end if;
end;
$$;

create or replace function app.read_calendar_secret(p_connection uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from public.calendar_connections c
  join vault.decrypted_secrets s on s.id = c.vault_secret_id
  where c.id = p_connection;
$$;

create or replace function app.delete_calendar_secret(p_connection uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  select vault_secret_id into v_secret_id
  from public.calendar_connections
  where id = p_connection
  for update;

  if v_secret_id is not null then
    update public.calendar_connections set vault_secret_id = null where id = p_connection;
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;

revoke execute on function app.store_calendar_secret(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function app.read_calendar_secret(uuid) from public, anon, authenticated, service_role;
revoke execute on function app.delete_calendar_secret(uuid) from public, anon, authenticated, service_role;
