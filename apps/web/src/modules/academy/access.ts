import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { roomActor } from '@/modules/rooms/server';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

export type AcademyDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  now?: () => Date;
};

export type NotFound = { ok: false; rule: 'not_found' };
export const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };
export const INVALID_INPUT = { ok: false, rule: 'invalid_input' } as const;
export const OK = { ok: true } as const;

export const nowOf = (deps: AcademyDeps) => (deps.now ?? (() => new Date()))();
export const isUuid = (value: string) => z.uuid().safeParse(value).success;

/** The room's writers prepare the academy and record the training sessions. */
export const academyWriter = (claims: VerifiedClaims, clientId: string, deps: AcademyDeps) =>
  roomActor(deps.contexts, claims, clientId, 'write');

export const academyReader = (claims: VerifiedClaims, clientId: string, deps: AcademyDeps) =>
  roomActor(deps.contexts, claims, clientId, 'read');

/** The client's room members, the decision makers and operational users, use the academy. */
export async function academyLearner(
  claims: VerifiedClaims,
  clientId: string,
  deps: AcademyDeps,
): Promise<boolean> {
  if (claims.user_kind !== 'client' || !isUuid(clientId)) return false;
  const [row] = await deps.contexts.withUserContext(claims, (tx) =>
    tx.execute<{ member: boolean }>(sql`
      select app.is_client_member(
        ${clientId}::uuid, array['decision_maker', 'operational']::app.client_role[]
      ) as member
    `),
  );
  return row?.member === true;
}
