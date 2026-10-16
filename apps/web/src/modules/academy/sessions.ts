import { and, eq, inArray } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { VerifiedClaims } from '@/platform/db';
import {
  academyWriter,
  INVALID_INPUT,
  isUuid,
  NOT_FOUND,
  nowOf,
  OK,
  type AcademyDeps,
  type NotFound,
} from './access';
import { sessionInput } from './domain/content';
import { sessionPeople } from './readers';

const { academyItems, trainingSessionMaterials, trainingSessionParticipants, trainingSessions } =
  schema;

/**
 * RF-141: records a training session, or edits one, with its participants (the client's members,
 * the team and typed guests) and the academy items used. Edits replace both lists.
 */
export async function saveTrainingSession(
  claims: VerifiedClaims,
  input: { clientId: string; sessionId?: string } & Record<string, unknown>,
  deps: AcademyDeps,
): Promise<{ ok: true; sessionId: string } | NotFound | typeof INVALID_INPUT> {
  const writer = await academyWriter(claims, input.clientId, deps);
  if (!writer) return NOT_FOUND;
  const session = sessionInput(input);
  if (!session) return INVALID_INPUT;
  const now = nowOf(deps);

  return deps.contexts.withSystemContext(async (tx) => {
    const people = new Set((await sessionPeople(tx, input.clientId)).map((person) => person.id));
    if (!session.participantIds.every((id) => people.has(id))) return INVALID_INPUT;
    const materialIds = [...new Set(session.materialIds)];
    if (materialIds.length > 0) {
      const own = await tx
        .select({ id: academyItems.id })
        .from(academyItems)
        .where(
          and(inArray(academyItems.id, materialIds), eq(academyItems.clientId, input.clientId)),
        );
      if (own.length !== materialIds.length) return INVALID_INPUT;
    }

    const fields = {
      heldOn: session.heldOn,
      title: session.title,
      durationMinutes: session.durationMinutes,
      summary: session.summary,
    };
    let sessionId = input.sessionId;
    if (sessionId) {
      if (!isUuid(sessionId)) return NOT_FOUND;
      const updated = await tx
        .update(trainingSessions)
        .set({ ...fields, updatedAt: now })
        .where(
          and(eq(trainingSessions.id, sessionId), eq(trainingSessions.clientId, input.clientId)),
        )
        .returning({ id: trainingSessions.id });
      if (updated.length === 0) return NOT_FOUND;
      await tx
        .delete(trainingSessionParticipants)
        .where(eq(trainingSessionParticipants.sessionId, sessionId));
      await tx
        .delete(trainingSessionMaterials)
        .where(eq(trainingSessionMaterials.sessionId, sessionId));
    } else {
      const [created] = await tx
        .insert(trainingSessions)
        .values({
          organizationId: writer.organizationId,
          clientId: input.clientId,
          ...fields,
          createdBy: writer.userId,
        })
        .returning({ id: trainingSessions.id });
      if (!created) throw new Error('The training session was not created');
      sessionId = created.id;
    }

    const scope = { organizationId: writer.organizationId, sessionId, clientId: input.clientId };
    const participants = [
      ...[...new Set(session.participantIds)].map((userId) => ({ ...scope, userId })),
      ...session.guests.map((guestName) => ({ ...scope, guestName })),
    ];
    if (participants.length > 0) await tx.insert(trainingSessionParticipants).values(participants);
    if (materialIds.length > 0) {
      await tx
        .insert(trainingSessionMaterials)
        .values(materialIds.map((itemId) => ({ ...scope, itemId })));
    }
    await recordAudit(tx, {
      organizationId: writer.organizationId,
      action: 'academy.session_saved',
      resourceType: 'training_session',
      resourceId: sessionId,
      clientId: input.clientId,
    });
    return { ok: true as const, sessionId };
  });
}

export async function deleteTrainingSession(
  claims: VerifiedClaims,
  sessionId: string,
  deps: AcademyDeps,
): Promise<typeof OK | NotFound> {
  if (!isUuid(sessionId)) return NOT_FOUND;
  const [row] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ clientId: trainingSessions.clientId })
      .from(trainingSessions)
      .where(eq(trainingSessions.id, sessionId)),
  );
  if (!row) return NOT_FOUND;
  const writer = await academyWriter(claims, row.clientId, deps);
  if (!writer) return NOT_FOUND;
  await deps.contexts.withSystemContext(async (tx) => {
    await tx.delete(trainingSessions).where(eq(trainingSessions.id, sessionId));
    await recordAudit(tx, {
      organizationId: writer.organizationId,
      action: 'academy.session_deleted',
      resourceType: 'training_session',
      resourceId: sessionId,
      clientId: row.clientId,
    });
  });
  return OK;
}
