import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type ClientRole } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { canWriteClient, withActor } from './authorization';
import { addTimelineEntry } from './timeline';

const { clients, contacts, followUps } = schema;

const contactSchema = z.object({
  clientId: z.uuid(),
  contactId: z.uuid().nullable(),
  fullName: z.string().trim().min(1).max(200),
  email: z.email().max(320).nullable(),
  phone: z.string().trim().max(40).nullable(),
  jobTitle: z.string().trim().max(120).nullable(),
  role: z.enum(['decision_maker', 'operational', 'client_finance']),
});

export type ContactInput = {
  clientId: string;
  contactId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  role: ClientRole;
};

export type ContactResult =
  | { ok: true; contactId: string }
  | { ok: false; rule: 'not_found' | 'invalid_input' | 'duplicate_email' };

function emptyToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export async function upsertContact(
  claims: VerifiedClaims,
  input: ContactInput,
  deps: { contexts: Pick<DbContexts, 'withUserContext'> },
): Promise<ContactResult> {
  const parsed = contactSchema.safeParse({
    ...input,
    email: emptyToNull(input.email)?.toLowerCase() ?? null,
    phone: emptyToNull(input.phone),
    jobTitle: emptyToNull(input.jobTitle),
  });
  if (!parsed.success) return { ok: false, rule: 'invalid_input' };
  const data = parsed.data;

  return withActor<ContactResult>(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (!(await canWriteClient(tx, actor, data.clientId)))
        return { ok: false, rule: 'not_found' };
      const [client] = await tx
        .select({ organizationId: clients.organizationId })
        .from(clients)
        .where(eq(clients.id, data.clientId));
      if (!client) return { ok: false, rule: 'not_found' };

      if (data.email) {
        const [duplicate] = await tx
          .select({ id: contacts.id })
          .from(contacts)
          .where(
            and(
              eq(contacts.clientId, data.clientId),
              sql`lower(${contacts.email}) = ${data.email}`,
              data.contactId ? ne(contacts.id, data.contactId) : undefined,
            ),
          );
        if (duplicate) return { ok: false, rule: 'duplicate_email' };
      }

      const values = {
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        jobTitle: data.jobTitle,
        role: data.role,
      };
      const [saved] = data.contactId
        ? await tx
            .update(contacts)
            .set(values)
            .where(and(eq(contacts.id, data.contactId), eq(contacts.clientId, data.clientId)))
            .returning({ id: contacts.id })
        : await tx
            .insert(contacts)
            .values({ ...values, organizationId: client.organizationId, clientId: data.clientId })
            .returning({ id: contacts.id });
      if (!saved) return { ok: false, rule: 'not_found' };

      await recordAudit(tx, {
        organizationId: client.organizationId,
        action: 'contact.saved',
        resourceType: 'contact',
        resourceId: saved.id,
        clientId: data.clientId,
        metadata: { created: data.contactId === null },
      });
      return { ok: true, contactId: saved.id };
    },
    { ok: false, rule: 'not_found' },
  );
}

export async function completeFollowUp(
  claims: VerifiedClaims,
  input: { followUpId: string; status: 'done' | 'dismissed' },
  deps: { contexts: Pick<DbContexts, 'withUserContext'> },
): Promise<{ ok: true } | { ok: false; rule: 'not_found' }> {
  if (!z.uuid().safeParse(input.followUpId).success) return { ok: false, rule: 'not_found' };

  return withActor<{ ok: true } | { ok: false; rule: 'not_found' }>(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const [followUp] = await tx
        .select({
          clientId: followUps.clientId,
          dealId: followUps.dealId,
          organizationId: followUps.organizationId,
        })
        .from(followUps)
        .where(and(eq(followUps.id, input.followUpId), eq(followUps.status, 'open')));
      if (!followUp || !(await canWriteClient(tx, actor, followUp.clientId))) {
        return { ok: false, rule: 'not_found' };
      }

      await tx
        .update(followUps)
        .set({ status: input.status, completedAt: new Date() })
        .where(eq(followUps.id, input.followUpId));
      await addTimelineEntry(tx, {
        organizationId: followUp.organizationId,
        clientId: followUp.clientId,
        dealId: followUp.dealId,
        kind: 'follow_up_completed',
        summary: { status: input.status },
        itemType: 'follow_up',
        itemId: input.followUpId,
        actorUserId: actor.userId,
      });
      await recordAudit(tx, {
        organizationId: followUp.organizationId,
        action: 'follow_up.completed',
        resourceType: 'follow_up',
        resourceId: input.followUpId,
        clientId: followUp.clientId,
        metadata: { status: input.status },
      });
      return { ok: true };
    },
    { ok: false, rule: 'not_found' },
  );
}
