-- Sending and withdrawing a proposal are founder actions that the services perform in the system
-- context; nobody changes the status or the sent date directly.
revoke update (status, sent_at) on table public.proposals from authenticated;
