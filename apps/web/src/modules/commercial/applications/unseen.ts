import { and, count, eq, gt } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';

const { applications, seenMarkers } = schema;

const AREA = 'applications';

export type SeenViewer = { userId: string; organizationId: string };

function markerOf(viewer: SeenViewer) {
  return and(
    eq(seenMarkers.userId, viewer.userId),
    eq(seenMarkers.organizationId, viewer.organizationId),
    eq(seenMarkers.area, AREA),
  );
}

export async function applicationsSeenAt(
  tx: DbTransaction,
  viewer: SeenViewer,
): Promise<Date | null> {
  const [marker] = await tx
    .select({ seenAt: seenMarkers.seenAt })
    .from(seenMarkers)
    .where(markerOf(viewer));
  return marker?.seenAt ?? null;
}

/**
 * Counts the applications the viewer may read (row level security applies) that arrived after
 * their last visit to the applications screen. Before a first visit every application is new.
 */
export async function unseenApplicationsCount(
  tx: DbTransaction,
  viewer: SeenViewer,
): Promise<number> {
  const seenAt = await applicationsSeenAt(tx, viewer);
  const [row] = await tx
    .select({ total: count() })
    .from(applications)
    .where(
      and(
        eq(applications.organizationId, viewer.organizationId),
        seenAt ? gt(applications.createdAt, seenAt) : undefined,
      ),
    );
  return row?.total ?? 0;
}

export async function markApplicationsSeen(
  tx: DbTransaction,
  input: SeenViewer & { now: Date },
): Promise<void> {
  await tx
    .insert(seenMarkers)
    .values({
      userId: input.userId,
      organizationId: input.organizationId,
      area: AREA,
      seenAt: input.now,
    })
    .onConflictDoUpdate({
      target: [seenMarkers.userId, seenMarkers.organizationId, seenMarkers.area],
      set: { seenAt: input.now },
    });
}
