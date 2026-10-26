-- A signed contract makes the prospect a client; clients signed before this rule existed catch up.
update public.clients c
set lifecycle = 'active'
where c.lifecycle = 'prospect'
  and exists (
    select 1 from public.contracts k where k.client_id = c.id and k.status = 'signed'
  );
