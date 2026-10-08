import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import { authorize, loadAccessContext, withActor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import type { PortalDocument } from '@/modules/documents';
import { listPortalDocuments } from '@/modules/documents/server';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { briefingGuideSchema, type BriefingGuide } from './templates/definitions';

const { applications, contacts, coreBriefingNotes, deals } = schema;

export type PortalCore = {
  briefing: {
    guide: BriefingGuide;
    sharedAt: Date;
    notes: Array<{ blockId: string; questionId: string | null; body: string }>;
  } | null;
  documents: PortalDocument[];
};

/**
 * Reads what was shared with a client user. Runs in that user's context: the portal view
 * filters by client membership and exposes only shareable columns, and row level security
 * hides notes of unshared briefings and draft documents.
 */
export async function getPortalCore(tx: DbTransaction, clientId: string): Promise<PortalCore> {
  const engagements = await tx.execute<{
    id: string;
    briefing_shared_at: string;
    briefing_guide: unknown;
  }>(sql`
    select id, briefing_shared_at, briefing_guide from public.portal_core_engagements
    where client_id = ${clientId}::uuid
    order by briefing_shared_at desc
    limit 1
  `);
  const engagement = engagements[0];
  const documents = await listPortalDocuments(tx, clientId);
  if (!engagement) return { briefing: null, documents };

  const rawGuide =
    typeof engagement.briefing_guide === 'string'
      ? (JSON.parse(engagement.briefing_guide) as unknown)
      : engagement.briefing_guide;
  const guide = briefingGuideSchema.safeParse(rawGuide);
  if (!guide.success) return { briefing: null, documents };
  const notes = await tx
    .select({
      blockId: coreBriefingNotes.blockId,
      questionId: coreBriefingNotes.questionId,
      body: coreBriefingNotes.body,
    })
    .from(coreBriefingNotes)
    .where(
      and(
        eq(coreBriefingNotes.engagementId, engagement.id),
        sql`trim(${coreBriefingNotes.body}) <> ''`,
      ),
    )
    .orderBy(asc(coreBriefingNotes.blockId), asc(coreBriefingNotes.questionId));

  return {
    briefing: {
      guide: guide.data,
      sharedAt: new Date(engagement.briefing_shared_at),
      notes: notes.map((note) => ({
        ...note,
        questionId: note.questionId === '' ? null : note.questionId,
      })),
    },
    documents,
  };
}

export type PortalInvite = (input: {
  email: string;
  fullName: string;
  clientId: string;
  role: 'decision_maker';
}) => Promise<{ userId: string } | { error: string }>;

export type GrantPortalAccessResult =
  | { ok: true }
  | { ok: false; rule: 'not_found' | 'no_decision_maker' | 'already_granted' | 'invite_failed' };

type Target =
  | { kind: 'refused'; rule: 'not_found' | 'no_decision_maker' | 'already_granted' }
  | {
      kind: 'contact';
      organizationId: string;
      clientId: string;
      contactId: string;
      email: string;
      fullName: string;
    };

/** Invites the deal's decision maker to the portal. The founder decides when (spec 1B). */
export async function grantPortalAccess(
  claims: VerifiedClaims,
  input: { dealId: string },
  deps: { contexts: Pick<DbContexts, 'withUserContext'>; invite: PortalInvite },
): Promise<GrantPortalAccessResult> {
  if (!z.uuid().safeParse(input.dealId).success) return { ok: false, rule: 'not_found' };

  const target = await withActor<Target>(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const [deal] = await tx
        .select({ organizationId: deals.organizationId, clientId: deals.clientId })
        .from(deals)
        .where(eq(deals.id, input.dealId));
      if (!deal) return { kind: 'refused', rule: 'not_found' };
      const ctx = await loadAccessContext(tx, actor);
      if (!authorize(actor, 'write', { type: 'pipeline', clientId: deal.clientId }, ctx).allowed) {
        return { kind: 'refused', rule: 'not_found' };
      }

      const [fromApplication] = await tx
        .select({ contactId: applications.contactId })
        .from(applications)
        .where(eq(applications.dealId, input.dealId))
        .orderBy(desc(applications.createdAt))
        .limit(1);
      const [contact] = await tx
        .select({
          id: contacts.id,
          email: contacts.email,
          fullName: contacts.fullName,
          portalUserId: contacts.portalUserId,
        })
        .from(contacts)
        .where(
          and(
            fromApplication
              ? eq(contacts.id, fromApplication.contactId)
              : eq(contacts.clientId, deal.clientId),
            eq(contacts.role, 'decision_maker'),
            isNotNull(contacts.email),
          ),
        )
        .limit(1);
      if (!contact?.email) return { kind: 'refused', rule: 'no_decision_maker' };
      if (contact.portalUserId) return { kind: 'refused', rule: 'already_granted' };
      return {
        kind: 'contact',
        organizationId: deal.organizationId,
        clientId: deal.clientId,
        contactId: contact.id,
        email: contact.email,
        fullName: contact.fullName,
      };
    },
    { kind: 'refused', rule: 'not_found' },
  );
  if (target.kind === 'refused') return { ok: false, rule: target.rule };

  const invited = await deps.invite({
    email: target.email,
    fullName: target.fullName,
    clientId: target.clientId,
    role: 'decision_maker',
  });
  if ('error' in invited) return { ok: false, rule: 'invite_failed' };

  await deps.contexts.withUserContext(claims, async (tx) => {
    await tx
      .update(contacts)
      .set({ portalUserId: invited.userId })
      .where(eq(contacts.id, target.contactId));
    await recordAudit(tx, {
      organizationId: target.organizationId,
      action: 'portal.access.granted',
      resourceType: 'contact',
      resourceId: target.contactId,
      clientId: target.clientId,
      metadata: { dealId: input.dealId },
    });
  });
  return { ok: true };
}
