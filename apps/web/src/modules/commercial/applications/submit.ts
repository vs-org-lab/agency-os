import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type ApplicationPath, type DbTransaction } from '@agency-os/db';
import type { Locale } from '@agency-os/i18n';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { DbContexts } from '@/platform/db';
import { FINAL_CODES } from '../pipeline/codes';
import { applyStageChange } from '../pipeline/service';
import { assessSubmission } from '../protection/bot-checks';
import { consumeThrottle, THROTTLE_LIMITS } from '../protection/throttle';
import { addTimelineEntry } from '../timeline';
import { getActiveForm } from './forms';
import { answersSchemaFor, scoreApplication, type ApplicationAnswers } from './scoring';

const { applications, clients, contacts, deals, organizations } = schema;

export type ApplicationSource = {
  utm: Partial<Record<'source' | 'medium' | 'campaign' | 'term' | 'content', string>>;
  landingPage: string | null;
  referrer: string | null;
  timeZone: string | null;
};

export type SubmitApplicationInput = {
  answers: unknown;
  source: unknown;
  consentTextVersion: string;
  consentAccepted: boolean;
  honeypot: string;
  startedAt: number;
  ipAddress: string | null;
  locale: Locale;
};

export type SubmitIssue = { questionId: string; code: string };

export type SubmitResult =
  | { status: 'accepted'; applicationId: string; dealId: string; path: ApplicationPath }
  | { status: 'discarded' }
  | { status: 'throttled' }
  | { status: 'invalid'; issues: SubmitIssue[] };

export type SubmitDeps = {
  contexts: Pick<DbContexts, 'withSystemContext'>;
  organizationSlug: string;
  linkSecret: string;
  now: () => Date;
  ipLimitPerHour?: number;
  flush?: () => Promise<void>;
};

const sourceSchema = z.object({
  utm: z
    .object({
      source: z.string().max(200).optional(),
      medium: z.string().max(200).optional(),
      campaign: z.string().max(200).optional(),
      term: z.string().max(200).optional(),
      content: z.string().max(200).optional(),
    })
    .catch({}),
  landingPage: z.string().max(2000).nullable().catch(null),
  referrer: z.string().max(2000).nullable().catch(null),
  timeZone: z.string().max(64).nullable().catch(null),
});

const EMPTY_SOURCE: ApplicationSource = {
  utm: {},
  landingPage: null,
  referrer: null,
  timeZone: null,
};

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function withNormalisedEmail(answers: unknown): unknown {
  if (typeof answers !== 'object' || answers === null) return answers;
  const contact = (answers as { contact?: unknown }).contact;
  if (typeof contact !== 'object' || contact === null) return answers;
  const email = (contact as { email?: unknown }).email;
  if (typeof email !== 'string') return answers;
  return { ...answers, contact: { ...contact, email: normaliseEmail(email) } };
}

function issuesFrom(error: z.ZodError): SubmitIssue[] {
  return error.issues.map((issue) => {
    const [group, key] = issue.path.map(String);
    const questionId =
      group === 'choices' || group === 'texts' ? (key ?? group) : (group ?? 'form');
    return { questionId, code: issue.code === 'custom' ? issue.message : 'invalid' };
  });
}

/**
 * An application is anonymous: a typed email proves nothing (SEC-11). It never changes or joins an
 * existing contact, client or deal; it opens its own prospect, and an email already known is
 * recorded as a possible duplicate for the founder to merge by hand.
 */
async function createProspect(
  tx: DbTransaction,
  organizationId: string,
  answers: ApplicationAnswers,
): Promise<{ clientId: string; contactId: string; possibleDuplicateOf: string | null }> {
  const email = answers.contact.email;
  const [existing] = await tx
    .select({ clientId: contacts.clientId })
    .from(contacts)
    .where(
      and(
        eq(contacts.organizationId, organizationId),
        sql`lower(${contacts.email}) = ${email}`,
        isNull(contacts.archivedAt),
      ),
    )
    .limit(1);

  const [client] = await tx
    .insert(clients)
    .values({
      organizationId,
      name: answers.company.name,
      website: answers.company.website,
      sector: answers.choices.sector ?? null,
      revenueBand: answers.choices.revenue ?? null,
      lifecycle: 'prospect',
    })
    .returning({ id: clients.id });
  if (!client) throw new Error('Prospect client was not created');

  const [contact] = await tx
    .insert(contacts)
    .values({
      organizationId,
      clientId: client.id,
      fullName: answers.contact.fullName,
      email,
      role: answers.choices.role === 'other' ? 'operational' : 'decision_maker',
    })
    .returning({ id: contacts.id });
  if (!contact) throw new Error('Prospect contact was not created');
  return {
    clientId: client.id,
    contactId: contact.id,
    possibleDuplicateOf: existing?.clientId ?? null,
  };
}

async function openDealFor(
  tx: DbTransaction,
  input: { organizationId: string; clientId: string; title: string },
): Promise<{ dealId: string; isNewDeal: boolean }> {
  const [open] = await tx
    .select({ id: deals.id })
    .from(deals)
    .where(
      and(
        eq(deals.clientId, input.clientId),
        notInArray(deals.pipelineCode, [...FINAL_CODES]),
        isNull(deals.archivedAt),
      ),
    )
    .for('update');
  if (open) return { dealId: open.id, isNewDeal: false };

  const [created] = await tx
    .insert(deals)
    .values({
      organizationId: input.organizationId,
      clientId: input.clientId,
      title: input.title,
      source: 'application',
    })
    .returning({ id: deals.id });
  if (!created) throw new Error('Deal was not created');
  return { dealId: created.id, isNewDeal: true };
}

export async function submitApplication(
  input: SubmitApplicationInput,
  deps: SubmitDeps,
): Promise<SubmitResult> {
  const now = deps.now();
  const verdict = assessSubmission({ honeypot: input.honeypot, startedAt: input.startedAt, now });
  if (verdict !== 'human') return { status: 'discarded' };
  if (!input.consentAccepted) {
    return { status: 'invalid', issues: [{ questionId: 'consent', code: 'required' }] };
  }

  const result = await deps.contexts.withSystemContext(async (tx): Promise<SubmitResult> => {
    const [organization] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.slug, deps.organizationSlug), isNull(organizations.archivedAt)));
    if (!organization) throw new Error('Public application organization was not found');
    const organizationId = organization.id;

    const form = await getActiveForm(tx, organizationId);
    const parsed = answersSchemaFor(form.definition).safeParse(withNormalisedEmail(input.answers));
    if (!parsed.success) return { status: 'invalid', issues: issuesFrom(parsed.error) };
    const answers = parsed.data;

    const throttleBase = { organizationId, now, secret: deps.linkSecret };
    const ipAllowed =
      input.ipAddress === null ||
      (await consumeThrottle(tx, {
        ...throttleBase,
        kind: 'application_ip',
        key: input.ipAddress,
        ...THROTTLE_LIMITS.applicationIp,
        limit: deps.ipLimitPerHour ?? THROTTLE_LIMITS.applicationIp.limit,
      }));
    const emailAllowed = await consumeThrottle(tx, {
      ...throttleBase,
      kind: 'application_email',
      key: answers.contact.email,
      ...THROTTLE_LIMITS.applicationEmail,
    });
    if (!ipAllowed || !emailAllowed) return { status: 'throttled' };

    const score = scoreApplication(form.definition, answers);
    const { clientId, contactId, possibleDuplicateOf } = await createProspect(
      tx,
      organizationId,
      answers,
    );
    const { dealId, isNewDeal } = await openDealFor(tx, {
      organizationId,
      clientId,
      title: answers.company.name,
    });

    const source = sourceSchema.safeParse(input.source);
    const [application] = await tx
      .insert(applications)
      .values({
        organizationId,
        clientId,
        contactId,
        dealId,
        formId: form.id,
        answers,
        score: score.score,
        path: score.path,
        knockouts: score.knockouts,
        source: {
          ...(source.success ? source.data : EMPTY_SOURCE),
          locale: input.locale,
          ...(possibleDuplicateOf ? { possibleDuplicateOf } : {}),
        },
        consentAt: now,
        consentTextVersion: input.consentTextVersion,
      })
      .returning({ id: applications.id });
    if (!application) throw new Error('Application was not recorded');

    if (isNewDeal) {
      const change = await applyStageChange(tx, {
        dealId,
        to: score.path === 'c' ? 'X.4' : '0.2',
        reason: score.path === 'c' ? 'path_c' : null,
        actor: 'system',
      });
      if (!change.ok) throw new Error(`Application routing was refused: ${change.rule}`);
    }

    await addTimelineEntry(tx, {
      organizationId,
      clientId,
      dealId,
      kind: 'application_submitted',
      summary: { score: score.score, path: score.path, knockouts: score.knockouts },
      itemType: 'application',
      itemId: application.id,
      actorUserId: null,
    });
    await recordAudit(tx, {
      organizationId,
      action: 'application.submitted',
      resourceType: 'application',
      resourceId: application.id,
      clientId,
      metadata: { path: score.path, score: score.score, formVersion: form.version },
    });
    await emit(tx, {
      type: 'commercial.application.submitted',
      organizationId,
      clientId,
      payload: {
        applicationId: application.id,
        dealId,
        path: score.path,
        isNewDeal,
        locale: input.locale,
      },
    });

    return { status: 'accepted', applicationId: application.id, dealId, path: score.path };
  });

  if (result.status === 'accepted') await (deps.flush ?? requestFlush)();
  return result;
}
