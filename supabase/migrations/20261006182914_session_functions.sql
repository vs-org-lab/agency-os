-- Active session listing and revocation, limited to the caller's own sessions (SEC-05).

create or replace function app.list_my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  last_active_at timestamptz,
  user_agent text,
  ip inet,
  aal text,
  is_current boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.created_at,
    coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) as last_active_at,
    s.user_agent,
    s.ip,
    s.aal::text,
    s.id::text = (select auth.jwt() ->> 'session_id') as is_current
  from auth.sessions s
  where s.user_id = (select auth.uid())
    and (s.not_after is null or s.not_after > now())
  order by last_active_at desc;
$$;

create or replace function app.revoke_my_session(p_session uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from auth.sessions s
  where s.id = p_session and s.user_id = (select auth.uid());
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke execute on function app.list_my_sessions() from public, anon;
revoke execute on function app.revoke_my_session(uuid) from public, anon;
grant execute on function app.list_my_sessions() to authenticated;
grant execute on function app.revoke_my_session(uuid) to authenticated;
