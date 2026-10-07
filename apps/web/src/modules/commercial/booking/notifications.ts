import { and, desc, eq, sql } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { isLocale, type Locale } from '@agency-os/i18n';
import {
  renderEmail,
  senderName,
  type EmailParams,
  type EmailPort,
  type EmailTemplateKey,
} from '@/modules/email';
import type { DbContexts } from '@/platform/db';
import {
  BOOKING_LINK_TTL_MS,
  bookingLinkToken,
  bookingUrl,
  manageUrl,
  newManageToken,
} from './links';
import { resolveTimeZone } from './slots';

const { applications, calls, clients, contacts, organizations } = schema;

export type NotificationDeps = {
  contexts: Pick<DbContexts, 'withSystemContext'>;
  email: EmailPort;
  appBaseUrl: string;
  linkSecret: string;
  now: () => Date;
};

type FounderTemplate = Extract<EmailTemplateKey, `founder.${string}`>;

type Sender = { agencyName: string; fromName: string; defaultLocale: Locale };

async function senderFor(tx: DbTransaction, organizationId: string): Promise<Sender> {
  const [organization] = await tx
    .select({
      name: organizations.name,
      branding: organizations.portalBranding,
      locale: organizations.defaultLocale,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  if (!organization) throw new Error(`Organization ${organizationId} was not found`);
  const agencyName = organization.branding.displayName ?? organization.name;

  const founders = await activeFounders(tx, organizationId);
  return {
    agencyName,
    fromName: senderName(founders[0]?.fullName ?? '', agencyName),
    defaultLocale: organization.locale,
  };
}

async function activeFounders(
  tx: DbTransaction,
  organizationId: string,
): Promise<Array<{ email: string; fullName: string }>> {
  return tx.execute<{ email: string; fullName: string }>(sql`
    select u.email, p.full_name as "fullName"
    from public.organization_memberships m
    join public.profiles p on p.id = m.user_id
    join auth.users u on u.id = m.user_id
    where m.organization_id = ${organizationId}::uuid
      and m.role = 'founder' and m.status = 'active' and m.archived_at is null
      and p.archived_at is null and u.email is not null
    order by m.created_at
  `);
}

type LeadContext = {
  organizationId: string;
  dealId: string;
  email: string | null;
  firstName: string;
  companyName: string;
  locale: Locale | null;
  timeZone: string | null;
};

async function leadForDeal(tx: DbTransaction, dealId: string): Promise<LeadContext | null> {
  const [row] = await tx
    .select({
      organizationId: applications.organizationId,
      source: applications.source,
      email: contacts.email,
      fullName: contacts.fullName,
      companyName: clients.name,
    })
    .from(applications)
    .innerJoin(contacts, eq(contacts.id, applications.contactId))
    .innerJoin(clients, eq(clients.id, applications.clientId))
    .where(eq(applications.dealId, dealId))
    .orderBy(desc(applications.createdAt))
    .limit(1);
  if (!row) return null;
  const source = (row.source ?? {}) as { locale?: string; timeZone?: string };
  return {
    organizationId: row.organizationId,
    dealId,
    email: row.email,
    firstName: row.fullName.trim().split(/\s+/)[0] ?? '',
    companyName: row.companyName,
    locale: source.locale && isLocale(source.locale) ? source.locale : null,
    timeZone: source.timeZone ?? null,
  };
}

async function send<K extends EmailTemplateKey>(
  deps: NotificationDeps,
  input: {
    to: string;
    template: K;
    locale: Locale;
    params: EmailParams[K];
    sender: Sender;
    organizationId: string;
  },
): Promise<void> {
  const rendered = renderEmail(input.template, input.locale, input.params);
  await deps.email.send({
    to: input.to,
    template: input.template,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    fromName: input.sender.fromName,
    organizationId: input.organizationId,
  });
}

export async function alertFounders<K extends FounderTemplate>(
  organizationId: string,
  template: K,
  params: EmailParams[K],
  deps: NotificationDeps,
): Promise<number> {
  const { sender, founders } = await deps.contexts.withSystemContext(async (tx) => ({
    sender: await senderFor(tx, organizationId),
    founders: await activeFounders(tx, organizationId),
  }));
  for (const founder of founders) {
    await send(deps, {
      to: founder.email,
      template,
      locale: sender.defaultLocale,
      params,
      sender,
      organizationId,
    });
  }
  return founders.length;
}

export async function sendBookingLinkEmail(
  dealId: string,
  deps: NotificationDeps,
): Promise<boolean> {
  const now = deps.now();
  const context = await deps.contexts.withSystemContext(async (tx) => {
    const lead = await leadForDeal(tx, dealId);
    return lead ? { lead, sender: await senderFor(tx, lead.organizationId) } : null;
  });
  const to = context?.lead.email;
  if (!context || !to) return false;
  const { lead, sender } = context;
  const locale = lead.locale ?? sender.defaultLocale;
  const expires = new Date(now.getTime() + BOOKING_LINK_TTL_MS);

  await send(deps, {
    to,
    template: 'lead.booking_link',
    locale,
    sender,
    organizationId: lead.organizationId,
    params: {
      firstName: lead.firstName,
      agencyName: sender.agencyName,
      bookingUrl: bookingUrl(deps.appBaseUrl, bookingLinkToken(dealId, deps.linkSecret, now)),
      expiresOn: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(expires),
    },
  });
  return true;
}

type CallContext = {
  callId: string;
  organizationId: string;
  dealId: string;
  status: string;
  startsAt: Date;
  meetUrl: string | null;
  leadTimeZone: string | null;
  contactEmail: string | null;
  contactName: string | null;
  companyName: string;
};

async function callContext(tx: DbTransaction, callId: string): Promise<CallContext | null> {
  const [row] = await tx
    .select({
      callId: calls.id,
      organizationId: calls.organizationId,
      dealId: calls.dealId,
      status: calls.status,
      startsAt: calls.startsAt,
      meetUrl: calls.meetUrl,
      leadTimeZone: calls.leadTimeZone,
      contactEmail: contacts.email,
      contactName: contacts.fullName,
      companyName: clients.name,
    })
    .from(calls)
    .innerJoin(clients, eq(clients.id, calls.clientId))
    .leftJoin(contacts, eq(contacts.id, calls.contactId))
    .where(eq(calls.id, callId));
  return row ?? null;
}

function startsAtLabel(startsAt: Date, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(startsAt);
}

async function leadCallMessage(
  callId: string,
  deps: NotificationDeps,
  rotateToken: boolean,
): Promise<{
  call: CallContext;
  lead: LeadContext | null;
  sender: Sender;
  manageToken: string | null;
} | null> {
  return deps.contexts.withSystemContext(async (tx) => {
    const call = await callContext(tx, callId);
    if (!call) return null;
    let manageToken: string | null = null;
    if (rotateToken) {
      const generated = newManageToken();
      await tx
        .update(calls)
        .set({ manageTokenHash: generated.hash })
        .where(and(eq(calls.id, callId), eq(calls.status, 'scheduled')));
      manageToken = generated.token;
    }
    return {
      call,
      lead: await leadForDeal(tx, call.dealId),
      sender: await senderFor(tx, call.organizationId),
      manageToken,
    };
  });
}

export async function sendCallConfirmation(
  callId: string,
  deps: NotificationDeps,
): Promise<boolean> {
  const context = await leadCallMessage(callId, deps, true);
  const to = context?.call.contactEmail;
  if (!context || context.call.status !== 'scheduled' || !to) return false;
  const { call, lead, sender, manageToken } = context;
  const locale = lead?.locale ?? sender.defaultLocale;
  const timeZone = resolveTimeZone(call.leadTimeZone, 'Europe/Lisbon');

  await send(deps, {
    to,
    template: 'lead.booking_confirmed',
    locale,
    sender,
    organizationId: call.organizationId,
    params: {
      firstName: (call.contactName ?? '').trim().split(/\s+/)[0] ?? '',
      agencyName: sender.agencyName,
      startsAtLabel: startsAtLabel(call.startsAt, locale, timeZone),
      meetUrl: call.meetUrl,
      manageUrl: manageUrl(deps.appBaseUrl, manageToken ?? ''),
    },
  });
  return true;
}

export async function sendCallReminder(
  callId: string,
  expectedStartsAt: Date,
  deps: NotificationDeps,
): Promise<'sent' | 'skipped'> {
  const context = await leadCallMessage(callId, deps, false);
  if (
    !context ||
    context.call.status !== 'scheduled' ||
    context.call.startsAt.getTime() !== expectedStartsAt.getTime() ||
    !context.call.contactEmail
  ) {
    return 'skipped';
  }
  const rotated = await leadCallMessage(callId, deps, true);
  const to = rotated?.call.contactEmail;
  if (!rotated?.manageToken || !to) return 'skipped';
  const { call, lead, sender, manageToken } = rotated;
  const locale = lead?.locale ?? sender.defaultLocale;

  await send(deps, {
    to,
    template: 'lead.call_reminder',
    locale,
    sender,
    organizationId: call.organizationId,
    params: {
      firstName: (call.contactName ?? '').trim().split(/\s+/)[0] ?? '',
      agencyName: sender.agencyName,
      startsAtLabel: startsAtLabel(
        call.startsAt,
        locale,
        resolveTimeZone(call.leadTimeZone, 'Europe/Lisbon'),
      ),
      meetUrl: call.meetUrl,
      manageUrl: manageUrl(deps.appBaseUrl, manageToken),
    },
  });
  return 'sent';
}

export async function sendBookingCancelled(
  callId: string,
  deps: NotificationDeps,
): Promise<boolean> {
  const context = await leadCallMessage(callId, deps, false);
  const to = context?.call.contactEmail;
  if (!context || !to) return false;
  const { call, lead, sender } = context;
  const now = deps.now();

  await send(deps, {
    to,
    template: 'lead.booking_cancelled',
    locale: lead?.locale ?? sender.defaultLocale,
    sender,
    organizationId: call.organizationId,
    params: {
      firstName: (call.contactName ?? '').trim().split(/\s+/)[0] ?? '',
      agencyName: sender.agencyName,
      bookingUrl: bookingUrl(deps.appBaseUrl, bookingLinkToken(call.dealId, deps.linkSecret, now)),
    },
  });
  return true;
}

export async function callOutcomeMissing(callId: string, deps: NotificationDeps): Promise<boolean> {
  const call = await deps.contexts.withSystemContext((tx) => callContext(tx, callId));
  if (!call) return false;
  const [row] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ outcome: calls.outcome, status: calls.status })
      .from(calls)
      .where(eq(calls.id, callId)),
  );
  if (!row || row.status === 'cancelled' || row.outcome !== null) return false;

  await alertFounders(
    call.organizationId,
    'founder.call_outcome_missing',
    {
      companyName: call.companyName,
      dealUrl: new URL(`/pipeline/${call.dealId}`, deps.appBaseUrl).toString(),
    },
    deps,
  );
  return true;
}
