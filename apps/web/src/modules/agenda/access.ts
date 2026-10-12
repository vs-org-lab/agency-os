import { z } from 'zod';
import { withActor, type Actor } from '@/modules/access';
import type { CalendarPort } from '@/modules/commercial';
import { roomActor } from '@/modules/rooms/server';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

export type HostCalendar = (
  organizationId: string,
) => Promise<{ port: CalendarPort; hostUserId: string } | null>;

export type AgendaDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  calendar: HostCalendar;
  flush?: () => Promise<void>;
  now?: () => Date;
};

export type NotFound = { ok: false; rule: 'not_found' };
export const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };
export const INVALID_INPUT = { ok: false, rule: 'invalid_input' } as const;
export const INVALID_STATE = { ok: false, rule: 'invalid_state' } as const;
export const OK = { ok: true } as const;

export const uuid = z.uuid();

const STUDIO_SCHEDULERS = new Set(['founder', 'project_manager']);

/**
 * Who schedules meetings: the room writers for a client's meetings, and the founder or a project
 * manager for internal ones. Freelancers and finance only read the agenda.
 */
export async function agendaWriter(
  claims: VerifiedClaims,
  clientId: string | null,
  deps: Pick<AgendaDeps, 'contexts'>,
): Promise<Actor | null> {
  if (claims.user_kind === 'client') return null;
  if (clientId !== null) return roomActor(deps.contexts, claims, clientId, 'write');
  return withActor(
    deps.contexts,
    claims,
    async (_tx, actor) =>
      actor.mfaVerifiedAt !== null && actor.roles.some((role) => STUDIO_SCHEDULERS.has(role))
        ? actor
        : null,
    null,
  );
}
