import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AgendaEventKind } from '@agency-os/db';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

export type PortalMeeting = {
  id: string;
  kind: AgendaEventKind;
  title: string;
  location: string;
  startsAt: string;
  endsAt: string;
  meetUrl: string | null;
};

/** The client's next meetings they are invited to, soonest first (portal_agenda_events). */
export async function listPortalMeetings(
  claims: VerifiedClaims,
  clientId: string,
  deps: { contexts: Pick<DbContexts, 'withUserContext'>; now?: () => Date },
  limit = 3,
): Promise<PortalMeeting[]> {
  if (claims.user_kind !== 'client' || !z.uuid().safeParse(clientId).success) return [];
  const now = (deps.now ?? (() => new Date()))();
  const rows = await deps.contexts.withUserContext(claims, (tx) =>
    tx.execute<{
      id: string;
      kind: AgendaEventKind;
      title: string;
      location: string;
      starts_at: string | Date;
      ends_at: string | Date;
      meet_url: string | null;
    }>(sql`
      select id, kind, title, location, starts_at, ends_at, meet_url
      from public.portal_agenda_events
      where client_id = ${clientId}::uuid and ends_at > ${now.toISOString()}::timestamptz
      order by starts_at
      limit ${limit}
    `),
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    location: row.location,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    meetUrl: row.meet_url,
  }));
}
