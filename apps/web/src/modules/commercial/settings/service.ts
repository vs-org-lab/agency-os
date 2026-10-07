import { asc, eq, isNull, max, and } from 'drizzle-orm';
import { z } from 'zod';
import {
  schema,
  type DbTransaction,
  type MessageTemplateKind,
  type WeeklyHours,
} from '@agency-os/db';
import type { Locale } from '@agency-os/i18n';
import { recordAudit } from '@/modules/audit';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { isFounderActor } from '../access';
import {
  applicationFormDefinitionSchema,
  type ApplicationFormDefinition,
} from '../applications/form-definition';
import { withActor } from '../authorization';
import { DEFAULT_BOOKING_RULES, type BookingRules } from '../booking/slots';

const { applicationForms, commercialSettings, messageTemplates } = schema;

type Contexts = { contexts: Pick<DbContexts, 'withUserContext'> };

export type CommercialSettingsView = Omit<BookingRules, 'stepMinutes'> & {
  hostUserId: string | null;
  selfDiagnosisUrl: string | null;
  anonymizeAfterMonths: number;
};

export async function getCommercialSettings(
  tx: DbTransaction,
  organizationId: string,
): Promise<CommercialSettingsView> {
  const [row] = await tx
    .select()
    .from(commercialSettings)
    .where(eq(commercialSettings.organizationId, organizationId));
  if (!row) {
    return {
      timeZone: DEFAULT_BOOKING_RULES.timeZone,
      weeklyHours: DEFAULT_BOOKING_RULES.weeklyHours,
      durationMinutes: DEFAULT_BOOKING_RULES.durationMinutes,
      bufferMinutes: DEFAULT_BOOKING_RULES.bufferMinutes,
      minimumNoticeHours: DEFAULT_BOOKING_RULES.minimumNoticeHours,
      horizonDays: DEFAULT_BOOKING_RULES.horizonDays,
      hostUserId: null,
      selfDiagnosisUrl: null,
      anonymizeAfterMonths: 12,
    };
  }
  return {
    timeZone: row.timeZone,
    weeklyHours: row.weeklyHours,
    durationMinutes: row.durationMinutes,
    bufferMinutes: row.bufferMinutes,
    minimumNoticeHours: row.minimumNoticeHours,
    horizonDays: row.horizonDays,
    hostUserId: row.hostUserId,
    selfDiagnosisUrl: row.selfDiagnosisUrl,
    anonymizeAfterMonths: row.anonymizeAfterMonths,
  };
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const window = z
  .object({ start: time, end: time })
  .refine((value) => value.start < value.end, { message: 'end_before_start' });
const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const bookingSchema = z.object({
  timeZone: z.string().refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }),
  weeklyHours: z.object(
    Object.fromEntries(weekdays.map((day) => [day, z.array(window).max(4)])) as Record<
      (typeof weekdays)[number],
      z.ZodArray<typeof window>
    >,
  ),
  durationMinutes: z.number().int().min(15).max(120),
  bufferMinutes: z.number().int().min(0).max(60),
  minimumNoticeHours: z.number().int().min(0).max(168),
  horizonDays: z.number().int().min(1).max(60),
  selfDiagnosisUrl: z.url({ protocol: /^https$/ }).nullable(),
  anonymizeAfterMonths: z.number().int().min(1).max(60),
});

export type BookingSettingsInput = z.input<typeof bookingSchema>;

export async function updateBookingSettings(
  claims: VerifiedClaims,
  input: BookingSettingsInput,
  deps: Contexts,
): Promise<{ ok: true } | { ok: false; rule: 'forbidden' | 'invalid_input' }> {
  const parsed = bookingSchema.safeParse(input);

  return withActor<{ ok: true } | { ok: false; rule: 'forbidden' | 'invalid_input' }>(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (!isFounderActor(actor)) return { ok: false, rule: 'forbidden' };
      if (!parsed.success) return { ok: false, rule: 'invalid_input' };
      const values = {
        timeZone: parsed.data.timeZone,
        weeklyHours: parsed.data.weeklyHours as WeeklyHours,
        durationMinutes: parsed.data.durationMinutes,
        bufferMinutes: parsed.data.bufferMinutes,
        minimumNoticeHours: parsed.data.minimumNoticeHours,
        horizonDays: parsed.data.horizonDays,
        selfDiagnosisUrl: parsed.data.selfDiagnosisUrl,
        anonymizeAfterMonths: parsed.data.anonymizeAfterMonths,
      };
      await tx
        .insert(commercialSettings)
        .values({ organizationId: actor.organizationId, ...values })
        .onConflictDoUpdate({ target: commercialSettings.organizationId, set: values });
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        action: 'commercial_settings.updated',
        resourceType: 'commercial_settings',
        metadata: { section: 'booking' },
      });
      return { ok: true };
    },
    { ok: false, rule: 'forbidden' },
  );
}

export async function publishApplicationForm(
  claims: VerifiedClaims,
  definition: ApplicationFormDefinition,
  deps: Contexts,
): Promise<{ ok: true; version: number } | { ok: false; issues: string[] }> {
  const parsed = applicationFormDefinitionSchema.safeParse(definition);

  return withActor<{ ok: true; version: number } | { ok: false; issues: string[] }>(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (!isFounderActor(actor)) return { ok: false, issues: ['forbidden'] };
      if (!parsed.success) {
        return { ok: false, issues: parsed.error.issues.map((issue) => issue.message) };
      }
      const [latest] = await tx
        .select({ version: max(applicationForms.version) })
        .from(applicationForms)
        .where(eq(applicationForms.organizationId, actor.organizationId));
      const version = (latest?.version ?? 0) + 1;

      await tx
        .update(applicationForms)
        .set({ isActive: false })
        .where(
          and(
            eq(applicationForms.organizationId, actor.organizationId),
            eq(applicationForms.isActive, true),
          ),
        );
      await tx.insert(applicationForms).values({
        organizationId: actor.organizationId,
        version,
        definition: parsed.data,
        isActive: true,
        createdBy: actor.userId,
      });
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        action: 'application_form.published',
        resourceType: 'application_form',
        metadata: { version },
      });
      return { ok: true, version };
    },
    { ok: false, issues: ['forbidden'] },
  );
}

const templateSchema = z.object({
  templateId: z.uuid().nullable(),
  kind: z.enum(['follow_up', 'acquisition', 'email']),
  sector: z.string().trim().max(80).nullable(),
  sequenceDay: z.union([z.literal(3), z.literal(7), z.literal(14), z.literal(30)]).nullable(),
  locale: z.enum(['pt-PT', 'en']),
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(200).nullable(),
  body: z.string().trim().min(1).max(5000),
});

export type TemplateInput = {
  templateId: string | null;
  kind: MessageTemplateKind;
  sector: string | null;
  sequenceDay: number | null;
  locale: Locale;
  name: string;
  subject: string | null;
  body: string;
};

export type MessageTemplateView = TemplateInput & { templateId: string };

export async function listMessageTemplates(tx: DbTransaction): Promise<MessageTemplateView[]> {
  const rows = await tx
    .select()
    .from(messageTemplates)
    .where(isNull(messageTemplates.archivedAt))
    .orderBy(
      asc(messageTemplates.kind),
      asc(messageTemplates.sequenceDay),
      asc(messageTemplates.name),
    );
  return rows.map((row) => ({
    templateId: row.id,
    kind: row.kind,
    sector: row.sector,
    sequenceDay: row.sequenceDay,
    locale: row.locale,
    name: row.name,
    subject: row.subject,
    body: row.body,
  }));
}

export async function saveMessageTemplate(
  claims: VerifiedClaims,
  input: TemplateInput,
  deps: Contexts,
): Promise<{ ok: true; templateId: string } | { ok: false; rule: 'forbidden' | 'invalid_input' }> {
  const parsed = templateSchema.safeParse({
    ...input,
    sector: input.sector?.trim() ? input.sector : null,
    subject: input.subject?.trim() ? input.subject : null,
  });

  return withActor<
    { ok: true; templateId: string } | { ok: false; rule: 'forbidden' | 'invalid_input' }
  >(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (!isFounderActor(actor)) return { ok: false, rule: 'forbidden' };
      if (!parsed.success) return { ok: false, rule: 'invalid_input' };
      const { templateId, ...values } = parsed.data;
      const [saved] = templateId
        ? await tx
            .update(messageTemplates)
            .set(values)
            .where(eq(messageTemplates.id, templateId))
            .returning({ id: messageTemplates.id })
        : await tx
            .insert(messageTemplates)
            .values({ ...values, organizationId: actor.organizationId })
            .returning({ id: messageTemplates.id });
      if (!saved) return { ok: false, rule: 'invalid_input' };
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        action: 'message_template.saved',
        resourceType: 'message_template',
        resourceId: saved.id,
        metadata: { kind: values.kind },
      });
      return { ok: true, templateId: saved.id };
    },
    { ok: false, rule: 'forbidden' },
  );
}
