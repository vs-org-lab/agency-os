import { sql } from 'drizzle-orm';
import type { AcademyItemKind, AcademyItemStatus, DbTransaction } from '@agency-os/db';
import type { VerifiedClaims } from '@/platform/db';
import { academyLearner, academyReader, academyWriter, type AcademyDeps } from './access';
import { checklistProgress } from './domain/progress';

export type AcademyStep = {
  id: string;
  text: string;
  done: boolean;
  checkedBy: string | null;
  checkedAt: Date | null;
};

export type AcademyItemView = {
  id: string;
  kind: AcademyItemKind;
  title: string;
  description: string;
  url: string | null;
  file: { id: string; name: string } | null;
  steps: AcademyStep[];
  progress: { done: number; total: number };
};

export type RoomAcademyItem = AcademyItemView & { status: AcademyItemStatus };

export type TrainingSessionView = {
  id: string;
  heldOn: string;
  title: string;
  durationMinutes: number | null;
  summary: string;
  participants: { id: string; userId: string | null; name: string }[];
  materials: { id: string; title: string; kind: AcademyItemKind }[];
};

export type RoomAcademyView = {
  canWrite: boolean;
  items: RoomAcademyItem[];
  sessions: TrainingSessionView[];
  /** Ready files in folders the client sees, for tutorials and manuals. */
  files: { id: string; name: string; folderName: string }[];
  /** The client's members and the team, for a session's participants. */
  people: { id: string; name: string; side: 'client' | 'team' }[];
};

export type PortalAcademyView = {
  canCheck: boolean;
  items: AcademyItemView[];
  sessions: TrainingSessionView[];
};

type ItemRow = {
  id: string;
  kind: AcademyItemKind;
  status: AcademyItemStatus;
  title: string;
  description: string;
  url: string | null;
  file_id: string | null;
  file_name: string | null;
};
type StepRow = {
  id: string;
  item_id: string;
  text: string;
  checked_by: string | null;
  checked_at: Date | null;
};

function assemble(items: ItemRow[], steps: StepRow[]): RoomAcademyItem[] {
  return items.map((item) => {
    const own = steps
      .filter((step) => step.item_id === item.id)
      .map((step) => ({
        id: step.id,
        text: step.text,
        done: step.checked_at !== null,
        checkedBy: step.checked_by,
        checkedAt: step.checked_at,
      }));
    return {
      id: item.id,
      kind: item.kind,
      status: item.status,
      title: item.title,
      description: item.description,
      url: item.url,
      file: item.file_id ? { id: item.file_id, name: item.file_name ?? '' } : null,
      steps: own,
      progress: checklistProgress(
        own.map((step) => step.id),
        new Set(own.filter((step) => step.done).map((step) => step.id)),
      ),
    };
  });
}

type SessionRow = {
  id: string;
  held_on: string;
  title: string;
  duration_minutes: number | null;
  summary: string;
};

function assembleSessions(
  sessions: SessionRow[],
  participants: { id: string; session_id: string; user_id: string | null; name: string }[],
  materials: { session_id: string; item_id: string; title: string; kind: AcademyItemKind }[],
): TrainingSessionView[] {
  return sessions.map((session) => ({
    id: session.id,
    heldOn: session.held_on,
    title: session.title,
    durationMinutes: session.duration_minutes,
    summary: session.summary,
    participants: participants
      .filter((participant) => participant.session_id === session.id)
      .map((participant) => ({
        id: participant.id,
        userId: participant.user_id,
        name: participant.name,
      })),
    materials: materials
      .filter((material) => material.session_id === session.id)
      .map((material) => ({ id: material.item_id, title: material.title, kind: material.kind })),
  }));
}

async function roomRecords(tx: DbTransaction, clientId: string) {
  const items = await tx.execute<ItemRow>(sql`
    select i.id, i.kind::text, i.status::text, i.title, i.description, i.url,
           f.id as file_id, f.name as file_name
    from public.academy_items i
    left join public.library_files f on f.id = i.library_file_id
    where i.client_id = ${clientId}::uuid
    order by i.position, i.created_at
  `);
  const steps = await tx.execute<StepRow>(sql`
    select s.id, s.item_id, s.text, p.full_name as checked_by, c.checked_at
    from public.academy_checklist_steps s
    left join public.academy_step_checks c on c.step_id = s.id
    left join public.profiles p on p.id = c.checked_by
    where s.client_id = ${clientId}::uuid
    order by s.item_id, s.position
  `);
  const sessions = await tx.execute<SessionRow>(sql`
    select id, held_on::text, title, duration_minutes, summary from public.training_sessions
    where client_id = ${clientId}::uuid order by held_on desc, created_at desc
  `);
  const participants = await tx.execute<{
    id: string;
    session_id: string;
    user_id: string | null;
    name: string;
  }>(sql`
    select tp.id, tp.session_id, tp.user_id, coalesce(p.full_name, tp.guest_name, '') as name
    from public.training_session_participants tp
    left join public.profiles p on p.id = tp.user_id
    where tp.client_id = ${clientId}::uuid
    order by tp.user_id is null, name
  `);
  const materials = await tx.execute<{
    session_id: string;
    item_id: string;
    title: string;
    kind: AcademyItemKind;
  }>(sql`
    select m.session_id, m.item_id, i.title, i.kind::text from public.training_session_materials m
    join public.academy_items i on i.id = m.item_id
    where m.client_id = ${clientId}::uuid order by i.position
  `);
  return { items, steps, sessions, participants, materials };
}

/** Files a tutorial or manual may use: ready, in a project of the client, under a client root. */
export async function eligibleFiles(tx: DbTransaction, clientId: string) {
  const rows = await tx.execute<{ id: string; name: string; folder_name: string }>(sql`
    select f.id, f.name, fo.name as folder_name
    from public.library_files f
    join public.library_folders fo on fo.id = f.folder_id
    join public.library_folders r on r.id = f.root_id
    where f.client_id = ${clientId}::uuid and f.status = 'ready' and r.visibility = 'client'
    order by lower(f.name), f.id
  `);
  return rows.map((row) => ({ id: row.id, name: row.name, folderName: row.folder_name }));
}

/** The people a session may list: the client's active members and the organisation's team. */
export async function sessionPeople(tx: DbTransaction, clientId: string) {
  const rows = await tx.execute<{ id: string; name: string; side: 'client' | 'team' }>(sql`
    select p.id, p.full_name as name, 'client' as side
    from public.client_memberships m join public.profiles p on p.id = m.user_id
    where m.client_id = ${clientId}::uuid and m.status = 'active'
    union
    select p.id, p.full_name, 'team'
    from public.organization_memberships m
    join public.clients c on c.organization_id = m.organization_id
    join public.profiles p on p.id = m.user_id
    where c.id = ${clientId}::uuid and m.status = 'active'
    order by side, name
  `);
  return rows.map((row) => ({ id: row.id, name: row.name, side: row.side }));
}

/** C-12: the client's academy and training sessions, for whoever reads the room. */
export async function loadRoomAcademy(
  claims: VerifiedClaims,
  clientId: string,
  deps: AcademyDeps,
): Promise<RoomAcademyView | null> {
  if (!(await academyReader(claims, clientId, deps))) return null;
  const canWrite = (await academyWriter(claims, clientId, deps)) !== null;
  return deps.contexts.withSystemContext(async (tx) => {
    const records = await roomRecords(tx, clientId);
    return {
      canWrite,
      items: assemble(records.items, records.steps),
      sessions: assembleSessions(records.sessions, records.participants, records.materials),
      files: canWrite ? await eligibleFiles(tx, clientId) : [],
      people: canWrite ? await sessionPeople(tx, clientId) : [],
    };
  });
}

/** P-09: the published academy and the training sessions, through the portal views. */
export async function loadPortalAcademy(
  claims: VerifiedClaims,
  clientId: string,
  deps: AcademyDeps,
): Promise<PortalAcademyView | null> {
  if (!(await academyLearner(claims, clientId, deps))) return null;
  return deps.contexts.withUserContext(claims, async (tx) => {
    const items = await tx.execute<ItemRow>(sql`
      select i.id, i.kind::text, 'published' as status, i.title, i.description, i.url,
             i.library_file_id as file_id, null as file_name
      from public.portal_academy_items i
      where i.client_id = ${clientId}::uuid
      order by i.position, i.published_at
    `);
    const steps = await tx.execute<StepRow>(sql`
      select s.id, s.item_id, s.text, c.checked_by_name as checked_by, c.checked_at
      from public.portal_academy_steps s
      left join public.portal_academy_checks c on c.step_id = s.id
      where s.client_id = ${clientId}::uuid
      order by s.item_id, s.position
    `);
    const sessions = await tx.execute<SessionRow>(sql`
      select id, held_on::text, title, duration_minutes, summary
      from public.portal_training_sessions
      where client_id = ${clientId}::uuid order by held_on desc
    `);
    const participants = await tx.execute<{
      id: string;
      session_id: string;
      user_id: string | null;
      name: string;
    }>(sql`
      select id, session_id, null as user_id, coalesce(name, '') as name
      from public.portal_training_participants
      where client_id = ${clientId}::uuid order by name
    `);
    const materials = await tx.execute<{
      session_id: string;
      item_id: string;
      title: string;
      kind: AcademyItemKind;
    }>(sql`
      select session_id, item_id, title, kind::text from public.portal_training_materials
      where client_id = ${clientId}::uuid order by title
    `);
    return {
      canCheck: true,
      items: assemble(items, steps).map(({ status: _status, ...item }) => item),
      sessions: assembleSessions(sessions, participants, materials),
    };
  });
}
