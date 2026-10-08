import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import { authorize, loadAccessContext, withActor, type Actor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { FIGMA_EMBED_HOST, toFigmaEmbedUrl } from './figma';

const { deals, documents } = schema;

export type DocumentDeps = {
  contexts: Pick<DbContexts, 'withUserContext'>;
  flush?: () => Promise<void>;
};

export type DocumentResult = { ok: true } | { ok: false; rule: 'not_found' };

async function canWrite(tx: DbTransaction, actor: Actor, clientId: string): Promise<boolean> {
  const ctx = await loadAccessContext(tx, actor);
  return authorize(actor, 'write', { type: 'pipeline', clientId }, ctx).allowed;
}

const saveSchema = z.object({
  documentId: z.uuid().optional(),
  dealId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().max(2000),
});

export function saveDocument(
  claims: VerifiedClaims,
  input: { documentId?: string; dealId: string; title: string; url: string },
  deps: DocumentDeps,
): Promise<{ ok: true; documentId: string } | { ok: false; rule: 'not_found' | 'invalid_input' }> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success || !toFigmaEmbedUrl(parsed.data.url, FIGMA_EMBED_HOST)) {
    return Promise.resolve({ ok: false, rule: 'invalid_input' });
  }
  const data = parsed.data;

  return withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const [deal] = await tx
        .select({ organizationId: deals.organizationId, clientId: deals.clientId })
        .from(deals)
        .where(eq(deals.id, data.dealId));
      if (!deal || !(await canWrite(tx, actor, deal.clientId))) {
        return { ok: false as const, rule: 'not_found' as const };
      }

      let documentId = data.documentId;
      if (documentId) {
        const updated = await tx
          .update(documents)
          .set({ title: data.title, url: data.url })
          .where(and(eq(documents.id, documentId), eq(documents.dealId, data.dealId)))
          .returning({ id: documents.id });
        if (updated.length === 0) {
          return { ok: false as const, rule: 'not_found' as const };
        }
      } else {
        const [created] = await tx
          .insert(documents)
          .values({
            organizationId: deal.organizationId,
            clientId: deal.clientId,
            dealId: data.dealId,
            kind: 'figma_presentation',
            title: data.title,
            url: data.url,
            authorId: actor.userId,
          })
          .returning({ id: documents.id });
        if (!created) throw new Error('Document was not recorded');
        documentId = created.id;
      }

      await recordAudit(tx, {
        organizationId: deal.organizationId,
        action: 'document.saved',
        resourceType: 'document',
        resourceId: documentId,
        clientId: deal.clientId,
        metadata: { kind: 'figma_presentation' },
      });
      return { ok: true as const, documentId };
    },
    { ok: false as const, rule: 'not_found' as const },
  );
}

type DocumentChange = 'share' | 'withdraw' | 'remove';

async function changeDocument(
  claims: VerifiedClaims,
  documentId: string,
  change: DocumentChange,
  deps: DocumentDeps,
): Promise<DocumentResult> {
  if (!z.uuid().safeParse(documentId).success) return { ok: false, rule: 'not_found' };

  const result = await withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const [document] = await tx
        .select({
          id: documents.id,
          organizationId: documents.organizationId,
          clientId: documents.clientId,
          dealId: documents.dealId,
          status: documents.status,
        })
        .from(documents)
        .where(eq(documents.id, documentId));
      if (!document || !(await canWrite(tx, actor, document.clientId))) {
        return { ok: false as const, emitted: false };
      }

      let emitted = false;
      if (change === 'remove') {
        await tx.delete(documents).where(eq(documents.id, documentId));
      } else if (change === 'withdraw') {
        await tx
          .update(documents)
          .set({ status: 'draft', sharedAt: null })
          .where(eq(documents.id, documentId));
      } else if (document.status !== 'with_client') {
        await tx
          .update(documents)
          .set({ status: 'with_client', sharedAt: new Date() })
          .where(eq(documents.id, documentId));
        await emit(tx, {
          type: 'core.document.shared',
          organizationId: document.organizationId,
          clientId: document.clientId,
          payload: { documentId, dealId: document.dealId },
        });
        emitted = true;
      }

      await recordAudit(tx, {
        organizationId: document.organizationId,
        action:
          change === 'remove'
            ? 'document.removed'
            : change === 'withdraw'
              ? 'document.withdrawn'
              : 'document.shared',
        resourceType: 'document',
        resourceId: documentId,
        clientId: document.clientId,
        metadata: {},
      });
      return { ok: true as const, emitted };
    },
    { ok: false as const, emitted: false },
  );

  if (!result.ok) return { ok: false, rule: 'not_found' };
  if (result.emitted) await (deps.flush ?? requestFlush)();
  return { ok: true };
}

export function shareDocument(
  claims: VerifiedClaims,
  input: { documentId: string },
  deps: DocumentDeps,
): Promise<DocumentResult> {
  return changeDocument(claims, input.documentId, 'share', deps);
}

export function withdrawDocument(
  claims: VerifiedClaims,
  input: { documentId: string },
  deps: DocumentDeps,
): Promise<DocumentResult> {
  return changeDocument(claims, input.documentId, 'withdraw', deps);
}

export function removeDocument(
  claims: VerifiedClaims,
  input: { documentId: string },
  deps: DocumentDeps,
): Promise<DocumentResult> {
  return changeDocument(claims, input.documentId, 'remove', deps);
}
