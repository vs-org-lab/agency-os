-- Voice notes and testimonial videos access: the room team reads voice notes of the projects it
-- may read (RN-51); clients read them through a view that follows the visibility of the comment
-- or approval they belong to and never exposes the storage path. Every write runs in server
-- services after authorisation.

revoke all on table public.voice_notes from anon, authenticated, service_role;--> statement-breakpoint
grant select on table public.voice_notes to authenticated;--> statement-breakpoint
alter table public.voice_notes force row level security;--> statement-breakpoint

create policy voice_notes_select on public.voice_notes
  for select to authenticated using (app.can_read_project(organization_id, client_id, project_id));--> statement-breakpoint

create view public.portal_voice_notes with (security_barrier = true) as
  select n.id, n.client_id, n.project_id, n.target_kind, n.target_id, n.author_id,
         n.content_type, n.duration_seconds, n.status, n.transcript, n.created_at
  from public.voice_notes n
  where n.status <> 'pending'
    and app.is_client_member(
      n.client_id, array['decision_maker', 'operational']::app.client_role[]
    )
    and (
      (n.target_kind = 'proof_comment' and exists (
        select 1 from public.portal_proof_comments c where c.id = n.target_id
      ))
      or (n.target_kind = 'approval_change_request' and exists (
        select 1 from public.portal_approvals a where a.id = n.target_id
      ))
    );--> statement-breakpoint

revoke all on table public.portal_voice_notes from anon, authenticated, service_role;--> statement-breakpoint
grant select on table public.portal_voice_notes to authenticated;--> statement-breakpoint

-- The decision maker's testimonial page tells a recorded video from a written testimonial.
create or replace view public.portal_testimonials with (security_barrier = true) as
  select t.id, t.client_id, t.project_id, t.body, t.author_name, t.author_role,
         t.consent_publish, t.updated_at, t.video_status, t.video_duration_seconds
  from public.testimonials t
  where app.is_client_member(t.client_id, array['decision_maker']::app.client_role[]);--> statement-breakpoint

-- Audio notes and testimonial videos are uploaded with signed upload links issued by the server and
-- read through signed links of 15 minutes; there are no policies on storage.objects for these
-- buckets. The local CI database starts without the Storage API.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'voice-notes', 'voice-notes', false, 10485760,
      array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']
    )
    on conflict (id) do nothing;
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'testimonial-videos', 'testimonial-videos', false, 52428800,
      array['video/webm', 'video/mp4']
    )
    on conflict (id) do nothing;
  end if;
end;
$$;
