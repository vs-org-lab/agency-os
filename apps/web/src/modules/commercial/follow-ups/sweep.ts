import { TZDate } from '@date-fns/tz';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import type { Locale } from '@agency-os/i18n';
import { addBusinessDays } from '@/modules/diagnosis';
import type { DbContexts } from '@/platform/db';
import { addTimelineEntry } from '../timeline';
import {
  CORE_FOLLOW_UP_DAY,
  CORE_FOLLOW_UP_TEMPLATES,
  DEFAULT_FOLLOW_UP_TEMPLATES,
} from './default-templates';
import { renderFollowUpMessage } from './render';

const { followUps, messageTemplates } = schema;

export const FOLLOW_UP_DAYS = [3, 7, 14, 30] as const;

export type SweepDeps = { contexts: Pick<DbContexts, 'withSystemContext'> };

type Candidate = {
  deal_id: string;
  organization_id: string;
  client_id: string;
  call_id: string;
  host_user_id: string;
  call_ends_at: Date;
  last_activity: Date;
  company_name: string;
  contact_name: string | null;
  time_zone: string;
  locale: Locale;
};

function localDayIndex(date: Date, timeZone: string): number {
  const local = new TZDate(date.getTime(), timeZone);
  return Math.floor(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()) / 86_400_000);
}

function localDate(date: Date, timeZone: string): string {
  const local = new TZDate(date.getTime(), timeZone);
  const month = String(local.getMonth() + 1).padStart(2, '0');
  const day = String(local.getDate()).padStart(2, '0');
  return `${local.getFullYear()}-${month}-${day}`;
}

export async function ensureDefaultTemplates(
  tx: DbTransaction,
  organizationId: string,
): Promise<void> {
  const [existing] = await tx
    .select({ id: messageTemplates.id })
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.organizationId, organizationId),
        eq(messageTemplates.kind, 'follow_up'),
      ),
    )
    .limit(1);
  if (existing) return;
  await tx.insert(messageTemplates).values(
    DEFAULT_FOLLOW_UP_TEMPLATES.map((template) => ({
      organizationId,
      kind: 'follow_up' as const,
      sequenceDay: template.sequenceDay,
      locale: template.locale,
      name: template.name,
      body: template.body,
    })),
  );
}

async function templateBody(
  tx: DbTransaction,
  organizationId: string,
  locale: Locale,
  day: number,
): Promise<string> {
  await ensureDefaultTemplates(tx, organizationId);
  const [template] = await tx
    .select({ body: messageTemplates.body })
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.organizationId, organizationId),
        eq(messageTemplates.kind, 'follow_up'),
        eq(messageTemplates.sequenceDay, day),
        eq(messageTemplates.locale, locale),
        isNull(messageTemplates.archivedAt),
      ),
    )
    .limit(1);
  return (
    template?.body ??
    DEFAULT_FOLLOW_UP_TEMPLATES.find(
      (entry) => entry.locale === locale && entry.sequenceDay === day,
    )?.body ??
    ''
  );
}

export async function createDueFollowUps(now: Date, deps: SweepDeps): Promise<number> {
  return deps.contexts.withSystemContext(async (tx) => {
    const candidates = await tx.execute<Candidate>(sql`
      select d.id as deal_id, d.organization_id, d.client_id,
             c.id as call_id, c.host_user_id, c.ends_at as call_ends_at,
             greatest(c.ends_at, coalesce(activity.last_at, c.ends_at)) as last_activity,
             cl.name as company_name, ct.full_name as contact_name,
             coalesce(cs.time_zone, 'Europe/Lisbon') as time_zone,
             o.default_locale::text as locale
      from public.deals d
      join public.clients cl on cl.id = d.client_id
      join public.organizations o on o.id = d.organization_id
      left join public.commercial_settings cs on cs.organization_id = d.organization_id
      join lateral (
        select calls.* from public.calls
        where calls.deal_id = d.id and calls.status = 'completed'
        order by calls.ends_at desc limit 1
      ) c on true
      left join public.contacts ct on ct.id = c.contact_id
      left join lateral (
        select max(t.created_at) as last_at from public.timeline_entries t
        where t.deal_id = d.id and t.kind not in ('follow_up_created', 'follow_up_completed')
      ) activity on true
      where d.archived_at is null
        and (d.pipeline_code = '0.4' or (c.outcome = 'follow_up' and d.pipeline_code not in ('X.3', 'X.4')))
    `);

    let created = 0;
    for (const candidate of candidates) {
      const lastActivity = new Date(candidate.last_activity);
      const elapsed =
        localDayIndex(now, candidate.time_zone) - localDayIndex(lastActivity, candidate.time_zone);
      const day = [...FOLLOW_UP_DAYS].reverse().find((threshold) => threshold <= elapsed);
      if (!day) continue;

      const firstName = (candidate.contact_name ?? '').trim().split(/\s+/)[0] ?? '';
      const message = renderFollowUpMessage(
        await templateBody(tx, candidate.organization_id, candidate.locale, day),
        {
          firstName,
          companyName: candidate.company_name,
          callDate: new Intl.DateTimeFormat(candidate.locale, {
            day: 'numeric',
            month: 'long',
            timeZone: candidate.time_zone,
          }).format(new Date(candidate.call_ends_at)),
        },
      );

      const inserted = await tx
        .insert(followUps)
        .values({
          organizationId: candidate.organization_id,
          clientId: candidate.client_id,
          dealId: candidate.deal_id,
          callId: candidate.call_id,
          dueOn: localDate(now, candidate.time_zone),
          sequenceDay: day,
          suggestedMessage: message,
          assignedTo: candidate.host_user_id,
        })
        .onConflictDoNothing()
        .returning({ id: followUps.id });
      const followUp = inserted[0];
      if (!followUp) continue;

      created += 1;
      await addTimelineEntry(tx, {
        organizationId: candidate.organization_id,
        clientId: candidate.client_id,
        dealId: candidate.deal_id,
        kind: 'follow_up_created',
        summary: { sequenceDay: day },
        itemType: 'follow_up',
        itemId: followUp.id,
        actorUserId: null,
      });
    }
    return created + (await createCoreFollowUps(tx, now));
  });
}

type CoreCandidate = {
  deal_id: string;
  organization_id: string;
  client_id: string;
  entered_at: string;
  call_id: string;
  host_user_id: string;
  contact_name: string | null;
  item_title: string | null;
  time_zone: string;
  locale: Locale;
};

const CORE_FOLLOW_UP_BUSINESS_DAYS = 5;

async function createCoreFollowUps(tx: DbTransaction, now: Date): Promise<number> {
  const candidates = await tx.execute<CoreCandidate>(sql`
    select d.id as deal_id, d.organization_id, d.client_id,
           entered.at as entered_at, c.id as call_id, c.host_user_id,
           ct.full_name as contact_name, item.title as item_title,
           coalesce(cs.time_zone, 'Europe/Lisbon') as time_zone,
           o.default_locale::text as locale
    from public.deals d
    join public.organizations o on o.id = d.organization_id
    left join public.commercial_settings cs on cs.organization_id = d.organization_id
    join lateral (
      select h.created_at as at from public.deal_stage_changes h
      where h.deal_id = d.id and h.to_code = '1.6'
      order by h.sequence desc limit 1
    ) entered on true
    join lateral (
      select calls.* from public.calls where calls.deal_id = d.id
      order by calls.starts_at desc limit 1
    ) c on true
    left join public.contacts ct on ct.id = c.contact_id
    left join lateral (
      select f.title from public.core_findings f
      join public.core_engagements e on e.id = f.engagement_id
      where e.deal_id = d.id
      order by (f.lane = 'days_90') desc, f.position, f.created_at
      limit 1
    ) item on true
    where d.archived_at is null and d.pipeline_code = '1.6'
      and not exists (
        select 1 from public.follow_ups fu
        where fu.deal_id = d.id and fu.sequence_day = ${CORE_FOLLOW_UP_DAY}
      )
  `);

  let created = 0;
  for (const candidate of candidates) {
    const due = addBusinessDays(
      new Date(candidate.entered_at),
      CORE_FOLLOW_UP_BUSINESS_DAYS,
      candidate.time_zone,
    );
    if (due.getTime() > now.getTime()) continue;

    const message = CORE_FOLLOW_UP_TEMPLATES[candidate.locale]
      .replace('{firstName}', (candidate.contact_name ?? '').trim().split(/s+/)[0] ?? '')
      .replace('{itemTitle}', candidate.item_title ?? '');
    const inserted = await tx
      .insert(followUps)
      .values({
        organizationId: candidate.organization_id,
        clientId: candidate.client_id,
        dealId: candidate.deal_id,
        callId: candidate.call_id,
        dueOn: localDate(now, candidate.time_zone),
        sequenceDay: CORE_FOLLOW_UP_DAY,
        suggestedMessage: message,
        assignedTo: candidate.host_user_id,
      })
      .onConflictDoNothing()
      .returning({ id: followUps.id });
    const followUp = inserted[0];
    if (!followUp) continue;

    created += 1;
    await addTimelineEntry(tx, {
      organizationId: candidate.organization_id,
      clientId: candidate.client_id,
      dealId: candidate.deal_id,
      kind: 'follow_up_created',
      summary: { sequenceDay: CORE_FOLLOW_UP_DAY, core: true },
      itemType: 'follow_up',
      itemId: followUp.id,
      actorUserId: null,
    });
  }
  return created;
}
