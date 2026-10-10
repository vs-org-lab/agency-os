import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { withActor, type Actor } from '@/modules/access';
import { canReadBilling } from '@/modules/billing';
import { canSeePipeline } from '@/modules/commercial';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { isStudioStaff } from './access';

const { clients, domainEvents, projects } = schema;

export const FEED_EVENT_TYPES = [
  'contracts.proposal.accepted',
  'contracts.contract.client_signed',
  'billing.payment.received',
  'rooms.approval.decided',
] as const;

export type FeedEventType = (typeof FEED_EVENT_TYPES)[number];

export type FeedEntry = {
  id: string;
  type: FeedEventType;
  clientId: string;
  clientName: string;
  dealId: string | null;
  /** Approval decision, present on `rooms.approval.decided` only. */
  decision: string | null;
  href: string;
  occurredAt: Date;
};

/**
 * Event types the actor may see under the security access matrix: freelancers read no proposals,
 * contracts or payments.
 */
function visibleTypes(actor: Actor): FeedEventType[] {
  return FEED_EVENT_TYPES.filter((type) => {
    if (type === 'billing.payment.received') return canReadBilling(actor);
    if (type.startsWith('contracts.')) return canSeePipeline(actor);
    return true;
  });
}

const FEED_DAYS = 30;
const FEED_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

type FeedPayload = { dealId?: unknown; decision?: unknown; projectId?: unknown };

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * S-02: what clients did in the last 30 days. Readable clients are resolved under the caller's row
 * level security; the events themselves are read in system context because `domain_events` has no
 * user policies.
 */
export async function loadStudioFeed(
  claims: VerifiedClaims,
  now: Date,
  deps: { contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'> },
): Promise<FeedEntry[] | null> {
  const scope = await withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (!isStudioStaff(actor)) return null;
      const readable = await tx
        .select({ id: clients.id, name: clients.name })
        .from(clients)
        .where(
          and(
            eq(clients.organizationId, actor.organizationId),
            sql`app.can_read_rooms(${actor.organizationId}::uuid, ${clients.id})`,
          ),
        );
      return {
        organizationId: actor.organizationId,
        pipeline: canSeePipeline(actor),
        types: visibleTypes(actor),
        clients: new Map(readable.map((client) => [client.id, client.name])),
        projects: new Set(
          (await tx.select({ id: projects.id }).from(projects)).map((project) => project.id),
        ),
      };
    },
    null,
  );
  if (scope === null) return null;
  if (scope.clients.size === 0) return [];

  const rows = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        id: domainEvents.id,
        type: domainEvents.type,
        clientId: domainEvents.clientId,
        payload: domainEvents.payload,
        createdAt: domainEvents.createdAt,
      })
      .from(domainEvents)
      .where(
        and(
          eq(domainEvents.organizationId, scope.organizationId),
          inArray(domainEvents.clientId, [...scope.clients.keys()]),
          inArray(domainEvents.type, scope.types),
          gte(domainEvents.createdAt, new Date(now.getTime() - FEED_DAYS * DAY_MS)),
        ),
      )
      .orderBy(desc(domainEvents.createdAt), desc(domainEvents.id))
      .limit(FEED_LIMIT),
  );

  return rows.flatMap((row) => {
    const clientName = row.clientId ? scope.clients.get(row.clientId) : undefined;
    if (!row.clientId || clientName === undefined) return [];
    const payload = (row.payload ?? {}) as FeedPayload;
    const projectId = text(payload.projectId);
    if (projectId && !scope.projects.has(projectId)) return [];
    const dealId = text(payload.dealId);
    return [
      {
        id: row.id,
        type: row.type as FeedEventType,
        clientId: row.clientId,
        clientName,
        dealId,
        decision: text(payload.decision),
        href:
          scope.pipeline && dealId && row.type !== 'rooms.approval.decided'
            ? `/pipeline/${dealId}`
            : `/c/${row.clientId}`,
        occurredAt: new Date(row.createdAt),
      },
    ];
  });
}
