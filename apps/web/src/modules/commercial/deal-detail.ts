import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  schema,
  type ApplicationPath,
  type CallKind,
  type CallOutcome,
  type CallStatus,
  type ClientRole,
  type DbTransaction,
  type DealSource,
  type NextStepOwnerKind,
  type TimelineKind,
} from '@agency-os/db';
import type { Currency, Locale } from '@agency-os/i18n';
import {
  applicationFormDefinitionSchema,
  type ApplicationFormDefinition,
} from './applications/form-definition';
import { visibleQuestions, type ApplicationAnswers } from './applications/scoring';
import type { PipelineCode } from './pipeline/codes';

const {
  applicationForms,
  applications,
  calls,
  clients,
  contacts,
  deals,
  followUps,
  organizationMemberships,
  profiles,
  timelineEntries,
} = schema;

export type DealAnswer = {
  questionId: string;
  label: string;
  answer: string;
  points: number | null;
  knockout: boolean;
};

export type DealDetail = {
  deal: {
    id: string;
    title: string;
    code: PipelineCode;
    nextStep: string | null;
    ownerKind: NextStepOwnerKind | null;
    ownerUserId: string | null;
    dueOn: string | null;
    estimatedValue: string | null;
    currency: Currency;
    source: DealSource;
    lostReason: string | null;
  };
  client: {
    id: string;
    name: string;
    website: string | null;
    sector: string | null;
    revenueBand: string | null;
  };
  contacts: Array<{
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    jobTitle: string | null;
    role: ClientRole;
  }>;
  applications: Array<{
    id: string;
    createdAt: Date;
    score: number;
    path: ApplicationPath;
    reviewDecision: ApplicationPath | null;
    anonymized: boolean;
    answers: DealAnswer[];
    costOfInaction: string | null;
    source: Record<string, unknown>;
  }>;
  calls: Array<{
    id: string;
    kind: CallKind;
    startsAt: Date;
    endsAt: Date;
    status: CallStatus;
    outcome: CallOutcome | null;
    outcomeReason: string | null;
    notes: string | null;
    meetUrl: string | null;
  }>;
  followUps: Array<{ id: string; dueOn: string; sequenceDay: number; suggestedMessage: string }>;
  timeline: Array<{
    id: string;
    kind: TimelineKind;
    summary: Record<string, unknown>;
    createdAt: Date;
    actorName: string | null;
  }>;
  staff: Array<{ id: string; fullName: string }>;
};

function answer(
  questionId: string,
  label: string,
  value: string,
  points: number | null = null,
  knockout = false,
): DealAnswer {
  return { questionId, label, answer: value, points, knockout };
}

function describeAnswers(
  definition: ApplicationFormDefinition | null,
  answers: ApplicationAnswers | null,
  locale: Locale,
): DealAnswer[] {
  if (!definition || !answers) return [];
  return visibleQuestions(definition, answers.choices ?? {}).flatMap((question): DealAnswer[] => {
    const label = question.label[locale];
    switch (question.kind) {
      case 'contact':
        return [
          answer(question.id, label, `${answers.contact.fullName} <${answers.contact.email}>`),
        ];
      case 'company':
        return [
          answer(
            question.id,
            label,
            [answers.company.name, answers.company.website].filter(Boolean).join(' · '),
          ),
        ];
      case 'long_text':
        return [answer(question.id, label, answers.texts?.[question.id] ?? '')];
      case 'single_choice': {
        const option = (question.options ?? []).find(
          (entry) => entry.id === answers.choices?.[question.id],
        );
        return option
          ? [answer(question.id, label, option.label[locale], option.points, option.knockout)]
          : [];
      }
    }
  });
}

function storedAnswers(value: unknown): ApplicationAnswers | null {
  return value && typeof value === 'object' && 'contact' in value
    ? (value as ApplicationAnswers)
    : null;
}

export async function getDealDetail(
  tx: DbTransaction,
  dealId: string,
  locale: Locale,
): Promise<DealDetail | null> {
  const [row] = await tx
    .select({ deal: deals, client: clients })
    .from(deals)
    .innerJoin(clients, eq(clients.id, deals.clientId))
    .where(eq(deals.id, dealId));
  if (!row) return null;
  const { deal, client } = row;

  const contactRows = await tx
    .select()
    .from(contacts)
    .where(and(eq(contacts.clientId, client.id), isNull(contacts.archivedAt)))
    .orderBy(asc(contacts.fullName));
  const applicationRows = await tx
    .select({ application: applications, definition: applicationForms.definition })
    .from(applications)
    .innerJoin(applicationForms, eq(applicationForms.id, applications.formId))
    .where(eq(applications.dealId, dealId))
    .orderBy(desc(applications.createdAt));
  const callRows = await tx
    .select()
    .from(calls)
    .where(eq(calls.dealId, dealId))
    .orderBy(desc(calls.startsAt));
  const followUpRows = await tx
    .select()
    .from(followUps)
    .where(and(eq(followUps.dealId, dealId), eq(followUps.status, 'open')))
    .orderBy(asc(followUps.dueOn));
  const timelineRows = await tx
    .select({ entry: timelineEntries, actorName: profiles.fullName })
    .from(timelineEntries)
    .leftJoin(profiles, eq(profiles.id, timelineEntries.actorUserId))
    .where(eq(timelineEntries.dealId, dealId))
    .orderBy(desc(timelineEntries.createdAt));
  const staffRows = await tx
    .select({ id: profiles.id, fullName: profiles.fullName })
    .from(organizationMemberships)
    .innerJoin(profiles, eq(profiles.id, organizationMemberships.userId))
    .where(
      and(
        eq(organizationMemberships.organizationId, deal.organizationId),
        eq(organizationMemberships.status, 'active'),
        inArray(organizationMemberships.role, ['founder', 'project_manager']),
      ),
    )
    .orderBy(asc(profiles.fullName));

  return {
    deal: {
      id: deal.id,
      title: deal.title,
      code: deal.pipelineCode,
      nextStep: deal.nextStep,
      ownerKind: deal.nextStepOwnerKind,
      ownerUserId: deal.nextStepOwnerUserId,
      dueOn: deal.nextStepDueOn,
      estimatedValue: deal.estimatedValue,
      currency: deal.currency,
      source: deal.source,
      lostReason: deal.lostReason,
    },
    client: {
      id: client.id,
      name: client.name,
      website: client.website,
      sector: client.sector,
      revenueBand: client.revenueBand,
    },
    contacts: contactRows.map((contact) => ({
      id: contact.id,
      fullName: contact.fullName,
      email: contact.email,
      phone: contact.phone,
      jobTitle: contact.jobTitle,
      role: contact.role,
    })),
    applications: applicationRows.map(({ application, definition }) => {
      const parsedDefinition = applicationFormDefinitionSchema.safeParse(definition);
      const answers = storedAnswers(application.answers);
      return {
        id: application.id,
        createdAt: application.createdAt,
        score: application.score,
        path: application.path,
        reviewDecision: application.reviewDecision,
        anonymized: application.anonymizedAt !== null,
        answers: describeAnswers(
          parsedDefinition.success ? parsedDefinition.data : null,
          answers,
          locale,
        ),
        costOfInaction: answers?.texts?.cost_of_inaction ?? null,
        source: application.source as Record<string, unknown>,
      };
    }),
    calls: callRows.map((call) => ({
      id: call.id,
      kind: call.kind,
      startsAt: call.startsAt,
      endsAt: call.endsAt,
      status: call.status,
      outcome: call.outcome,
      outcomeReason: call.outcomeReason,
      notes: call.notes,
      meetUrl: call.meetUrl,
    })),
    followUps: followUpRows.map((followUp) => ({
      id: followUp.id,
      dueOn: followUp.dueOn,
      sequenceDay: followUp.sequenceDay,
      suggestedMessage: followUp.suggestedMessage,
    })),
    timeline: timelineRows.map(({ entry, actorName }) => ({
      id: entry.id,
      kind: entry.kind,
      summary: entry.summary as Record<string, unknown>,
      createdAt: entry.createdAt,
      actorName,
    })),
    staff: staffRows,
  };
}
