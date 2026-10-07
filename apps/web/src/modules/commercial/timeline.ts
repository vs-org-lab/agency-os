import { schema, type DbTransaction, type TimelineKind } from '@agency-os/db';

const { timelineEntries } = schema;

export type TimelineEntryInput = {
  organizationId: string;
  clientId: string;
  dealId: string | null;
  kind: TimelineKind;
  summary: Record<string, unknown>;
  itemType: string | null;
  itemId: string | null;
  actorUserId: string | null;
};

export async function addTimelineEntry(
  tx: DbTransaction,
  input: TimelineEntryInput,
): Promise<void> {
  await tx.insert(timelineEntries).values({
    organizationId: input.organizationId,
    clientId: input.clientId,
    dealId: input.dealId,
    kind: input.kind,
    summary: input.summary,
    itemType: input.itemType,
    itemId: input.itemId,
    actorUserId: input.actorUserId,
  });
}
