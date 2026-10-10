import { and, eq, isNull, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import { emit, requestFlush } from '@/modules/events';
import type { VerifiedClaims } from '@/platform/db';
import { parseAnchor } from './domain/anchors';
import type { ProofingDeps } from './files';

const { proofComments, proofVersions } = schema;

type NotFound = { ok: false; rule: 'not_found' };
const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };
const uuid = z.uuid();
const bodySchema = z.string().trim().min(1).max(2000);

type Commenter = 'team' | 'client';

/** Decision 6: the founder, the client's managers and the project's freelancers comment. */
const COMMENTING_ROLES = sql`array['founder', 'project_manager', 'freelancer']::app.org_role[]`;

/**
 * Who comments on a version: the room team that reads the project (row level security) in a
 * commenting role, or the client's decision maker or operational user through the portal view
 * (only versions sent for approval).
 */
async function commenter(
  claims: VerifiedClaims,
  versionId: string,
  deps: ProofingDeps,
): Promise<Commenter | null> {
  return deps.contexts.withUserContext(claims, async (tx) => {
    const [team] = await tx
      .select({ organizationId: proofVersions.organizationId })
      .from(proofVersions)
      .where(and(eq(proofVersions.id, versionId), eq(proofVersions.status, 'ready')));
    if (team) {
      const [role] = await tx.execute<{ allowed: boolean }>(
        sql`select app.has_org_role(${team.organizationId}::uuid, ${COMMENTING_ROLES}) as allowed`,
      );
      return role?.allowed === true ? 'team' : null;
    }
    const rows = await tx.execute<{ id: string }>(
      sql`select id from public.portal_proof_versions where id = ${versionId}::uuid`,
    );
    return rows.length > 0 ? 'client' : null;
  });
}

export async function addProofComment(
  claims: VerifiedClaims,
  input: {
    versionId: string;
    body: string;
    anchor?: unknown;
    internal?: boolean;
    parentId?: string | null;
  },
  deps: ProofingDeps & { flush?: () => Promise<void> },
): Promise<{ ok: true; commentId: string } | NotFound | { ok: false; rule: 'invalid_input' }> {
  if (!uuid.safeParse(input.versionId).success) return NOT_FOUND;
  const role = await commenter(claims, input.versionId, deps);
  if (!role) return NOT_FOUND;
  const body = bodySchema.safeParse(input.body);
  const requestedInternal = input.internal === true;
  if (!body.success || (requestedInternal && role === 'client')) {
    return { ok: false, rule: 'invalid_input' };
  }
  if (input.parentId && !uuid.safeParse(input.parentId).success) {
    return { ok: false, rule: 'invalid_input' };
  }

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const [version] = await tx
      .select()
      .from(proofVersions)
      .where(eq(proofVersions.id, input.versionId));
    if (!version?.kind) return NOT_FOUND;
    const anchor = parseAnchor(version.kind, input.anchor, version.pages);
    if (anchor === 'invalid') return { ok: false as const, rule: 'invalid_input' as const };
    let internal = requestedInternal;
    if (input.parentId) {
      const [parent] = await tx
        .select({ id: proofComments.id, internal: proofComments.internal })
        .from(proofComments)
        .where(
          and(
            eq(proofComments.id, input.parentId),
            eq(proofComments.versionId, version.id),
            isNull(proofComments.parentId),
          ),
        );
      if (!parent || (parent.internal && role === 'client')) {
        return { ok: false as const, rule: 'invalid_input' as const };
      }
      // RN-23: a reply inside an internal thread is internal, whatever the form sent.
      internal = internal || parent.internal;
    }
    let number: number | null = null;
    if (!input.parentId) {
      const [latest] = await tx
        .select({ number: max(proofComments.number) })
        .from(proofComments)
        .where(eq(proofComments.versionId, version.id));
      number = (latest?.number ?? 0) + 1;
    }
    const [comment] = await tx
      .insert(proofComments)
      .values({
        organizationId: version.organizationId,
        clientId: version.clientId,
        projectId: version.projectId,
        versionId: version.id,
        parentId: input.parentId ?? null,
        authorId: claims.sub,
        body: body.data,
        anchor: input.parentId ? null : anchor,
        number,
        internal,
      })
      .returning({ id: proofComments.id });
    if (!comment) throw new Error('Proof comment was not added');
    await emit(tx, {
      type: 'proofing.comment.added',
      organizationId: version.organizationId,
      clientId: version.clientId,
      payload: {
        projectId: version.projectId,
        versionId: version.id,
        commentId: comment.id,
        byClient: role === 'client',
        internal,
      },
    });
    return { ok: true as const, commentId: comment.id };
  });
  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}

/** The team marks a comment as dealt with, or reopens it. */
export async function resolveProofComment(
  claims: VerifiedClaims,
  input: { commentId: string; resolved: boolean },
  deps: ProofingDeps,
): Promise<{ ok: true } | NotFound> {
  if (!uuid.safeParse(input.commentId).success) return NOT_FOUND;
  const [visible] = await deps.contexts.withUserContext(claims, (tx) =>
    tx
      .select({ versionId: proofComments.versionId })
      .from(proofComments)
      .where(eq(proofComments.id, input.commentId)),
  );
  if (!visible || (await commenter(claims, visible.versionId, deps)) !== 'team') return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();
  await deps.contexts.withSystemContext((tx) =>
    tx
      .update(proofComments)
      .set({ resolvedAt: input.resolved ? now : null })
      .where(eq(proofComments.id, input.commentId)),
  );
  return { ok: true };
}
