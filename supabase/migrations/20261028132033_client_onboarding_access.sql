-- Client onboarding: the team reads the client's answers like the room; the answers are written by
-- the onboarding service after it authorised the client member. Clients read their own answers, the
-- people of the agency assigned to them and the meetings they are invited to through portal views.
-- The structured briefing answer is written with the note, like its body.

grant update (answer) on table public.core_briefing_notes to authenticated;--> statement-breakpoint

revoke all on table public.client_onboarding_responses from anon, authenticated, service_role;--> statement-breakpoint
grant select on table public.client_onboarding_responses to authenticated;--> statement-breakpoint
alter table public.client_onboarding_responses force row level security;--> statement-breakpoint

create policy client_onboarding_responses_select on public.client_onboarding_responses
  for select to authenticated using (app.can_read_rooms(organization_id, client_id));--> statement-breakpoint

create view public.portal_onboarding_responses with (security_barrier = true) as
  select r.id, r.client_id, r.engagement_id, r.request_id, r.response, r.completed_at,
         pr.full_name as responded_by_name
  from public.client_onboarding_responses r
  left join public.profiles pr on pr.id = r.responded_by
  where app.is_client_member(
    r.client_id, array['decision_maker', 'operational']::app.client_role[]
  );--> statement-breakpoint

-- The people of the agency on the client's account, with how to reach them.
create view public.portal_client_team with (security_barrier = true) as
  select a.client_id, a.user_id, p.full_name, m.role, u.email
  from public.client_staff_assignments a
  join public.profiles p on p.id = a.user_id
  join public.organization_memberships m
    on m.organization_id = a.organization_id and m.user_id = a.user_id
  join auth.users u on u.id = a.user_id
  where a.archived_at is null
    and p.archived_at is null
    and m.status = 'active'
    and m.archived_at is null
    and m.role in ('founder', 'project_manager')
    and app.is_client_member(a.client_id, null);--> statement-breakpoint

-- Upcoming meetings the client is invited to; internal notes stay out.
create view public.portal_agenda_events with (security_barrier = true) as
  select e.id, e.client_id, e.project_id, e.kind, e.title, e.location, e.starts_at, e.ends_at,
         e.meet_url
  from public.agenda_events e
  where e.client_id is not null
    and e.invite_client
    and e.status = 'scheduled'
    and e.kind <> 'internal'
    and app.is_client_member(e.client_id, null);--> statement-breakpoint

revoke all on table
  public.portal_onboarding_responses,
  public.portal_client_team,
  public.portal_agenda_events
from anon, authenticated, service_role;--> statement-breakpoint
grant select on table
  public.portal_onboarding_responses,
  public.portal_client_team,
  public.portal_agenda_events
to authenticated;--> statement-breakpoint

-- The preview reads as the role the team chose in `app.preview_role` (the decision maker unless
-- told otherwise), still only inside a read-only transaction.
create or replace function app.is_client_member(p_client uuid, p_roles app.client_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.client_memberships cm
    join public.clients c on c.id = cm.client_id
    join public.organizations o on o.id = cm.organization_id
    join public.profiles p on p.id = cm.user_id
    where cm.client_id = p_client
      and cm.user_id = (select auth.uid())
      and cm.status = 'active'
      and cm.archived_at is null
      and c.archived_at is null
      and o.archived_at is null
      and p.archived_at is null
      and (p_roles is null or cm.role = any (p_roles))
  )
  -- The CASE keeps the access check from running outside a matching preview.
  or case
    when current_setting('transaction_read_only') = 'on'
      and current_setting('app.preview_client', true) = p_client::text
      and (
        p_roles is null
        or coalesce(nullif(current_setting('app.preview_role', true), ''), 'decision_maker')
          = any (p_roles::text[])
      )
    then app.can_preview_client(p_client)
    else false
  end;
$$;
