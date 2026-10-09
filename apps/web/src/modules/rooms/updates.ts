import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type UpdateVisibility } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { VerifiedClaims } from '@/platform/db';
import { roomActor } from './authorize';
import type { RoomsDeps } from './runtime-types';

const { projectUpdates, projects } = schema;

export const MAX_UPDATE_LENGTH = 5000;

const updateSchema = z.object({
  projectId: z.uuid(),
  body: z.string().trim().min(1).max(MAX_UPDATE_LENGTH),
  milestone: z.string().trim().max(120).nullable(),
  visibility: z.enum(['internal', 'client']),
});

/**
 * Posts an update to the project feed. Updates are internal by default (RN-50); a client-visible
 * one notifies the client's decision maker.
 */
export async function publishUpdate(
  claims: VerifiedClaims,
  input: {
    projectId: string;
    body: string;
    milestone: string | null;
    visibility: UpdateVisibility;
  },
  deps: RoomsDeps,
): Promise<{ ok: true } | { ok: false; rule: 'not_found' | 'invalid_input' }> {
  if (!z.uuid().safeParse(input.projectId).success) return { ok: false, rule: 'not_found' };
  const clientId = await deps.contexts.withUserContext(claims, async (tx) => {
    const [project] = await tx
      .select({ clientId: projects.clientId })
      .from(projects)
      .where(eq(projects.id, input.projectId));
    return project?.clientId ?? null;
  });
  const actor = clientId ? await roomActor(deps.contexts, claims, clientId, 'write') : null;
  if (!actor || !clientId) return { ok: false, rule: 'not_found' };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, rule: 'invalid_input' };
  const data = parsed.data;

  await deps.contexts.withSystemContext(async (tx) => {
    const [update] = await tx
      .insert(projectUpdates)
      .values({
        organizationId: actor.organizationId,
        clientId,
        projectId: data.projectId,
        authorId: actor.userId,
        kind: 'manual',
        body: data.body,
        milestone: data.milestone || null,
        visibility: data.visibility,
      })
      .returning({ id: projectUpdates.id });
    if (!update) throw new Error('Project update was not saved');
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      action: 'project.update_published',
      resourceType: 'project_update',
      resourceId: update.id,
      clientId,
      metadata: { visibility: data.visibility },
    });
    if (data.visibility === 'client') {
      await emit(tx, {
        type: 'rooms.update.published',
        organizationId: actor.organizationId,
        clientId,
        payload: { projectId: data.projectId, updateId: update.id },
      });
    }
  });
  if (data.visibility === 'client') await (deps.flush ?? requestFlush)();
  return { ok: true };
}
