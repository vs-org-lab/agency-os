import { sql } from 'drizzle-orm';
import type { VerifiedClaims } from '@/platform/db';
import { agendaWriter, uuid, type AgendaDeps } from './access';
import { addDays, dayBounds, lisbonDay } from './domain/grid';
import type { MeetingKind } from './domain/meeting';
import type { AgendaItem, AgendaView } from './views';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 45;
const UPCOMING_TIMED = 5;
const UPCOMING_DEADLINE_DAYS = 7;

type Timestamp = Date | string;

type MeetingRow = {
  id: string;
  kind: MeetingKind;
  title: string;
  notes: string;
  location: string;
  starts_at: Timestamp;
  ends_at: Timestamp;
  client_id: string | null;
  client_name: string | null;
  project_id: string | null;
  invite_client: boolean;
  sync_status: 'pending' | 'synced' | 'failed';
  meet_url: string | null;
};

type DatedRow = {
  kind: AgendaItem['kind'];
  id: string;
  title: string;
  client_id: string | null;
  client_name: string | null;
  project_id: string | null;
  deal_id: string | null;
  day: string | null;
  starts_at: Timestamp | null;
  ends_at: Timestamp | null;
};

function rangeDays(from: string, to: string): number | null {
  if (!DAY_PATTERN.test(from) || !DAY_PATTERN.test(to)) return null;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(days) && days >= 0 ? days : null;
}

function href(row: DatedRow): string | null {
  switch (row.kind) {
    case 'call':
      return `/pipeline/${row.deal_id}`;
    case 'phase_due':
    case 'step_due':
      return `/c/${row.client_id}?project=${row.project_id}`;
    case 'task_due':
      return '/tasks';
    case 'delivery':
      return `/c/${row.client_id}`;
    default:
      return null;
  }
}

/**
 * Everything dated between two Lisbon days that the reader may see (RF-100): meetings, calls for
 * pipeline readers, phase, step and task deadlines and project deliveries, all under the reader's
 * row level security, optionally for one client.
 */
export async function loadAgenda(
  claims: VerifiedClaims,
  input: { from: string; to: string; clientId?: string },
  deps: AgendaDeps,
): Promise<AgendaView | null> {
  if (claims.user_kind === 'client') return null;
  const span = rangeDays(input.from, input.to);
  if (span === null || span > MAX_RANGE_DAYS) return null;
  if (input.clientId !== undefined && !uuid.safeParse(input.clientId).success) return null;
  const start = dayBounds(input.from).start.toISOString();
  const end = dayBounds(input.to).end.toISOString();
  const now = (deps.now ?? (() => new Date()))();
  const client = input.clientId ?? null;
  const onlyClient = (column: string) =>
    client === null ? sql`` : sql`and ${sql.raw(column)} = ${client}::uuid`;

  const read = await deps.contexts.withUserContext(claims, async (tx) => {
    const meetings = await tx.execute<MeetingRow>(sql`
      select e.id, e.kind::text as kind, e.title, e.notes, e.location, e.starts_at, e.ends_at,
             e.client_id, c.name as client_name, e.project_id, e.invite_client,
             e.sync_status::text as sync_status, e.meet_url
      from public.agenda_events e
      left join public.clients c on c.id = e.client_id
      where e.status = 'scheduled' and e.starts_at < ${end}::timestamptz
        and e.ends_at > ${start}::timestamptz ${onlyClient('e.client_id')}
    `);
    const dated = await tx.execute<DatedRow>(sql`
      select 'call' as kind, k.id, c.name as title, k.client_id, c.name as client_name,
             null::uuid as project_id, k.deal_id, null::text as day, k.starts_at, k.ends_at
      from public.calls k
      join public.clients c on c.id = k.client_id
      where k.status = 'scheduled' and k.starts_at < ${end}::timestamptz
        and k.ends_at > ${start}::timestamptz ${onlyClient('k.client_id')}
      union all
      select 'phase_due', ph.id, ph.name, p.client_id, c.name, p.id, null, ph.due_on::text,
             null, null
      from public.project_phases ph
      join public.projects p on p.id = ph.project_id
      join public.clients c on c.id = p.client_id
      where ph.due_on between ${input.from}::date and ${input.to}::date
        and ph.status <> 'done' and p.status <> 'cancelled'
        and app.can_read_project(p.organization_id, p.client_id, p.id) ${onlyClient('p.client_id')}
      union all
      select 'step_due', s.id, s.name, p.client_id, c.name, p.id, null, s.due_on::text, null, null
      from public.project_steps s
      join public.projects p on p.id = s.project_id
      join public.clients c on c.id = p.client_id
      where s.due_on between ${input.from}::date and ${input.to}::date
        and s.status <> 'done' and p.status <> 'cancelled'
        and app.can_read_project(p.organization_id, p.client_id, p.id) ${onlyClient('p.client_id')}
      union all
      select 'task_due', t.id, t.title, t.client_id, c.name, t.project_id, null, t.due_on::text,
             null, null
      from public.tasks t
      left join public.clients c on c.id = t.client_id
      where t.status = 'open' and t.due_on between ${input.from}::date and ${input.to}::date
        ${onlyClient('t.client_id')}
      union all
      select 'delivery', p.id, p.name, p.client_id, c.name, p.id, null, p.ends_on::text, null, null
      from public.projects p
      join public.clients c on c.id = p.client_id
      where p.status = 'active' and p.ends_on between ${input.from}::date and ${input.to}::date
        and app.can_read_project(p.organization_id, p.client_id, p.id) ${onlyClient('p.client_id')}
    `);
    const schedulable = await tx.execute<{ id: string; name: string }>(sql`
      select c.id, c.name from public.clients c
      where app.can_write_rooms(c.organization_id, c.id) ${onlyClient('c.id')}
      order by c.name
    `);
    return { meetings, dated, schedulable };
  });

  const writers = new Map<string | null, boolean>();
  const canWrite = async (clientId: string | null) => {
    if (!writers.has(clientId)) {
      writers.set(clientId, (await agendaWriter(claims, clientId, deps)) !== null);
    }
    return writers.get(clientId) === true;
  };

  const items: AgendaItem[] = [];
  for (const row of read.meetings) {
    const startsAt = new Date(row.starts_at);
    items.push({
      kind: 'meeting',
      id: row.id,
      title: row.title,
      clientId: row.client_id,
      clientName: row.client_name,
      projectId: row.project_id,
      allDay: false,
      day: lisbonDay(startsAt),
      startsAt: startsAt.toISOString(),
      endsAt: new Date(row.ends_at).toISOString(),
      href: null,
      meeting: {
        kind: row.kind,
        notes: row.notes,
        location: row.location,
        meetUrl: row.meet_url,
        inviteClient: row.invite_client,
        syncStatus: row.sync_status,
        editable: startsAt.getTime() > now.getTime() && (await canWrite(row.client_id)),
      },
    });
  }
  for (const row of read.dated) {
    const startsAt = row.starts_at === null ? null : new Date(row.starts_at);
    items.push({
      kind: row.kind,
      id: row.id,
      title: row.title,
      clientId: row.client_id,
      clientName: row.client_name,
      projectId: row.project_id,
      allDay: startsAt === null,
      day: startsAt ? lisbonDay(startsAt) : (row.day ?? input.from),
      startsAt: startsAt?.toISOString() ?? null,
      endsAt: row.ends_at === null ? null : new Date(row.ends_at).toISOString(),
      href: href(row),
    });
  }
  items.sort(
    (left, right) =>
      left.day.localeCompare(right.day) ||
      Number(!left.allDay) - Number(!right.allDay) ||
      (left.startsAt ?? '').localeCompare(right.startsAt ?? '') ||
      left.title.localeCompare(right.title, 'pt'),
  );

  return {
    items,
    canSchedule: await canWrite(client),
    clients: read.schedulable.map((row) => ({ id: row.id, name: row.name })),
  };
}

/** S-01 "Próximos eventos": the next timed items and the deadlines of the coming week. */
export async function loadUpcoming(
  claims: VerifiedClaims,
  deps: AgendaDeps,
): Promise<AgendaItem[]> {
  const now = (deps.now ?? (() => new Date()))();
  const from = lisbonDay(now);
  const view = await loadAgenda(claims, { from, to: addDays(from, UPCOMING_DEADLINE_DAYS) }, deps);
  if (!view) return [];
  const timed = view.items
    .filter((item) => !item.allDay && item.startsAt !== null && item.startsAt >= now.toISOString())
    .slice(0, UPCOMING_TIMED);
  const deadlines = view.items.filter((item) => item.allDay);
  return [...timed, ...deadlines];
}
