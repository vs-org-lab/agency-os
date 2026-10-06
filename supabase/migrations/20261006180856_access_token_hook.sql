-- Adds the user_kind claim (internal or client) to every access token issued by Supabase Auth.

create or replace function app.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  select p.kind::text
    into v_kind
    from public.profiles p
   where p.id = (event ->> 'user_id')::uuid
     and p.archived_at is null;

  return jsonb_set(
    event,
    '{claims}',
    coalesce(event -> 'claims', '{}'::jsonb) || jsonb_build_object('user_kind', v_kind)
  );
end;
$$;

grant usage on schema app to supabase_auth_admin;
revoke execute on function app.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function app.custom_access_token_hook(jsonb) to supabase_auth_admin;
