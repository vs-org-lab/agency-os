-- Testimonials access: the room team reads the testimonials of the projects it may read (RN-51);
-- the client's decision maker reads their own through a view. Every write runs in server services.

revoke all on table public.testimonials from anon, authenticated, service_role;
grant select on table public.testimonials to authenticated;

alter table public.testimonials force row level security;

create policy testimonials_select on public.testimonials
  for select to authenticated using (app.can_read_project(organization_id, client_id, project_id));

create view public.portal_testimonials with (security_barrier = true) as
  select t.id, t.client_id, t.project_id, t.body, t.author_name, t.author_role,
         t.consent_publish, t.updated_at
  from public.testimonials t
  where app.is_client_member(t.client_id, array['decision_maker']::app.client_role[]);

revoke all on table public.portal_testimonials from anon, authenticated, service_role;
grant select on table public.portal_testimonials to authenticated;
