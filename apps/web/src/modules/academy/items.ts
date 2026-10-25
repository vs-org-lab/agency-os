import { and, eq, inArray, max, sql } from 'drizzle-orm';
import { schema, type AcademyItemStatus, type DbTransaction } from '@agency-os/db';
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
import { itemInput, type ItemInput } from './domain/content';
import { eligibleFiles } from './readers';

const { academyChecklistSteps, academyItems } = schema;

type InvalidInput = typeof INVALID_INPUT;

/** The item's client, read before deciding who may change it. */
async function itemClient(itemId: string, deps: AcademyDeps): Promise<string | null> {
  if (!isUuid(itemId)) return null;
  const [row] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ clientId: academyItems.clientId })
      .from(academyItems)
      .where(eq(academyItems.id, itemId)),
  );
  return row?.clientId ?? null;
}

async function itemWriter(claims: VerifiedClaims, itemId: string, deps: AcademyDeps) {
  const clientId = await itemClient(itemId, deps);
  if (!clientId) return null;
  const actor = await academyWriter(claims, clientId, deps);
  return actor ? { actor, clientId } : null;
}

/**
 * Replaces a checklist's steps. A step whose text is kept keeps its row, and so the client's
 * check, wherever it moves; removed steps go with their checks.
 */
async function replaceSteps(
  tx: DbTransaction,
  scope: { organizationId: string; clientId: string; itemId: string },
  texts: string[],
): Promise<void> {
  const existing = await tx
    .select({ id: academyChecklistSteps.id, text: academyChecklistSteps.text })
    .from(academyChecklistSteps)
    .where(eq(academyChecklistSteps.itemId, scope.itemId))
    .orderBy(academyChecklistSteps.position);
  const unused = [...existing];
  const kept = texts.map((text) => {
    const index = unused.findIndex((step) => step.text === text);
    return index >= 0 ? (unused.splice(index, 1)[0]?.id ?? null) : null;
  });
  if (unused.length > 0) {
    await tx.delete(academyChecklistSteps).where(
      inArray(
        academyChecklistSteps.id,
        unused.map((step) => step.id),
      ),
    );
  }
  // Positions are unique per checklist: park the kept steps out of the way before renumbering.
  await tx
    .update(academyChecklistSteps)
    .set({ position: sql`-${academyChecklistSteps.position}` })
    .where(eq(academyChecklistSteps.itemId, scope.itemId));
  for (const [index, text] of texts.entries()) {
    const stepId = kept[index];
    if (stepId) {
      await tx
        .update(academyChecklistSteps)
        .set({ position: index + 1 })
        .where(eq(academyChecklistSteps.id, stepId));
    } else {
      await tx.insert(academyChecklistSteps).values({
        organizationId: scope.organizationId,
        clientId: scope.clientId,
        itemId: scope.itemId,
        position: index + 1,
        text,
      });
    }
  }
}

const sourceColumns = (input: ItemInput) => ({
  libraryFileId:
    input.source && 'libraryFileId' in input.source ? input.source.libraryFileId : null,
  url: input.source && 'url' in input.source ? input.source.url : null,
});

/** RF-140: creates an item at the end of the academy, or edits one. */
export async function saveAcademyItem(
  claims: VerifiedClaims,
  input: { clientId: string; itemId?: string } & Record<string, unknown>,
  deps: AcademyDeps,
): Promise<{ ok: true; itemId: string } | NotFound | InvalidInput> {
  const writer = await academyWriter(claims, input.clientId, deps);
  if (!writer) return NOT_FOUND;
  const item = itemInput(input);
  if (!item) return INVALID_INPUT;
  const now = nowOf(deps);

  return deps.contexts.withSystemContext(async (tx) => {
    const source = sourceColumns(item);
    if (source.libraryFileId) {
      const file = (await eligibleFiles(tx, input.clientId)).find(
        (candidate) => candidate.id === source.libraryFileId,
      );
      // A tutorial plays in the portal, so its library material must be a video.
      if (!file || (item.kind === 'tutorial' && file.kind !== 'video')) return INVALID_INPUT;
    }
    let itemId = input.itemId;
    if (itemId) {
      const updated = await tx
        .update(academyItems)
        .set({
          title: item.title,
          description: item.description,
          ...source,
          updatedAt: now,
        })
        .where(
          and(
            eq(academyItems.id, itemId),
            eq(academyItems.clientId, input.clientId),
            eq(academyItems.kind, item.kind),
          ),
        )
        .returning({ id: academyItems.id });
      if (updated.length === 0) return NOT_FOUND;
    } else {
      const [last] = await tx
        .select({ position: max(academyItems.position) })
        .from(academyItems)
        .where(eq(academyItems.clientId, input.clientId));
      const [created] = await tx
        .insert(academyItems)
        .values({
          organizationId: writer.organizationId,
          clientId: input.clientId,
          kind: item.kind,
          title: item.title,
          description: item.description,
          position: (last?.position ?? 0) + 1,
          ...source,
          createdBy: writer.userId,
        })
        .returning({ id: academyItems.id });
      if (!created) throw new Error('The academy item was not created');
      itemId = created.id;
    }
    if (item.kind === 'checklist') {
      await replaceSteps(
        tx,
        { organizationId: writer.organizationId, clientId: input.clientId, itemId },
        item.steps,
      );
    }
    await recordAudit(tx, {
      organizationId: writer.organizationId,
      action: 'academy.item_saved',
      resourceType: 'academy_item',
      resourceId: itemId,
      clientId: input.clientId,
      metadata: { kind: item.kind },
    });
    return { ok: true as const, itemId };
  });
}

/** Publishing shows the item in the portal; withdrawing hides it and keeps the client's checks. */
export async function setAcademyItemStatus(
  claims: VerifiedClaims,
  input: { itemId: string; status: AcademyItemStatus },
  deps: AcademyDeps,
): Promise<typeof OK | NotFound> {
  if (input.status !== 'draft' && input.status !== 'published') return NOT_FOUND;
  const access = await itemWriter(claims, input.itemId, deps);
  if (!access) return NOT_FOUND;
  const now = nowOf(deps);
  await deps.contexts.withSystemContext(async (tx) => {
    await tx
      .update(academyItems)
      .set({
        status: input.status,
        ...(input.status === 'published' ? { publishedAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(academyItems.id, input.itemId));
    await recordAudit(tx, {
      organizationId: access.actor.organizationId,
      action: input.status === 'published' ? 'academy.item_published' : 'academy.item_withdrawn',
      resourceType: 'academy_item',
      resourceId: input.itemId,
      clientId: access.clientId,
    });
  });
  return OK;
}

export async function deleteAcademyItem(
  claims: VerifiedClaims,
  itemId: string,
  deps: AcademyDeps,
): Promise<typeof OK | NotFound> {
  const access = await itemWriter(claims, itemId, deps);
  if (!access) return NOT_FOUND;
  await deps.contexts.withSystemContext(async (tx) => {
    await tx.delete(academyItems).where(eq(academyItems.id, itemId));
    await recordAudit(tx, {
      organizationId: access.actor.organizationId,
      action: 'academy.item_deleted',
      resourceType: 'academy_item',
      resourceId: itemId,
      clientId: access.clientId,
    });
  });
  return OK;
}

/** Swaps the item with its neighbour in the academy's order; at either end nothing moves. */
export async function moveAcademyItem(
  claims: VerifiedClaims,
  input: { itemId: string; direction: 'up' | 'down' },
  deps: AcademyDeps,
): Promise<typeof OK | NotFound> {
  if (input.direction !== 'up' && input.direction !== 'down') return NOT_FOUND;
  const access = await itemWriter(claims, input.itemId, deps);
  if (!access) return NOT_FOUND;
  await deps.contexts.withSystemContext(async (tx) => {
    const ordered = await tx.execute<{ id: string; position: number }>(sql`
      select id, position from public.academy_items
      where client_id = ${access.clientId}::uuid
      order by position, created_at
      for update
    `);
    const index = ordered.findIndex((row) => row.id === input.itemId);
    const other = ordered[input.direction === 'up' ? index - 1 : index + 1];
    const current = ordered[index];
    if (!current || !other) return;
    // Equal positions (older rows) get distinct ones by order first.
    for (const [position, row] of ordered.entries()) {
      if (row.position !== position + 1) {
        await tx
          .update(academyItems)
          .set({ position: position + 1 })
          .where(eq(academyItems.id, row.id));
      }
    }
    const currentPosition = index + 1;
    const otherPosition = input.direction === 'up' ? index : index + 2;
    await tx
      .update(academyItems)
      .set({ position: otherPosition })
      .where(eq(academyItems.id, current.id));
    await tx
      .update(academyItems)
      .set({ position: currentPosition })
      .where(eq(academyItems.id, other.id));
  });
  return OK;
}
