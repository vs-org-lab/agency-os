import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { schema, type CallKind, type DbTransaction } from '@agency-os/db';
import { isLocale, type Locale } from '@agency-os/i18n';
import {
  renderEmail,
  type EmailParams,
  type EmailPort,
  type EmailTemplateKey,
  activeFounders,
  organizationSender,
  type OrganizationSender,
} from '@/modules/email';
import type { DbContexts } from '@/platform/db';
import {
  BOOKING_LINK_TTL_MS,
  bookingLinkToken,
  bookingUrl,
  hashManageToken,
  manageToken,
  manageUrl,
} from './links';
import { resolveTimeZone } from './slots';

const { applications, calls, clients, contacts, deals } = schema;

export type NotificationDeps = {
  contexts: Pick<DbContexts, 'withSystemContext'>;
  email: EmailPort;
  appBaseUrl: string;
  linkSecret: string;
  now: () => Date;
};

type FounderTemplate = Extract<EmailTemplateKey, `founder.${string}`>;

type Sender = OrganizationSender;

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
    sender: await organizationSender(tx, organizationId),
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

/** Founders plus the project managers assigned to the client, each once. */
export async function alertClientTeam<K extends FounderTemplate>(
  organizationId: string,
  clientId: string,
  template: K,
  params: EmailParams[K],
  deps: NotificationDeps,
): Promise<number> {
  const { sender, recipients } = await deps.contexts.withSystemContext(async (tx) => {
    const founders = await activeFounders(tx, organizationId);
    const managers = await tx.execute<{ email: string }>(sql`
      select u.email
      from public.client_staff_assignments a
      join public.organization_memberships m
        on m.organization_id = a.organization_id and m.user_id = a.user_id
      join public.profiles p on p.id = a.user_id
      join auth.users u on u.id = a.user_id
      where a.organization_id = ${organizationId}::uuid and a.client_id = ${clientId}::uuid
        and a.archived_at is null and m.role = 'project_manager' and m.status = 'active'
        and m.archived_at is null and p.archived_at is null and u.email is not null
    `);
    return {
      sender: await organizationSender(tx, organizationId),
      recipients: [...new Set([...founders, ...managers].map((person) => person.email))],
    };
  });
  for (const to of recipients) {
    await send(deps, {
      to,
      template,
      locale: sender.defaultLocale,
      params,
      sender,
      organizationId,
    });
  }
  return recipients.length;
}

export async function sendBookingLinkEmail(
  dealId: string,
  deps: NotificationDeps,
): Promise<boolean> {
  const now = deps.now();
  const context = await deps.contexts.withSystemContext(async (tx) => {
    const lead = await leadForDeal(tx, dealId);
    return lead ? { lead, sender: await organizationSender(tx, lead.organizationId) } : null;
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
  kind: CallKind;
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
      kind: calls.kind,
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
): Promise<{
  call: CallContext;
  lead: LeadContext | null;
  sender: Sender;
  manageToken: string;
} | null> {
  return deps.contexts.withSystemContext(async (tx) => {
    const call = await callContext(tx, callId);
    if (!call) return null;
    const token = manageToken(callId, deps.linkSecret);
    if (call.status === 'scheduled') {
      await tx
        .update(calls)
        .set({ manageTokenHash: hashManageToken(token) })
        .where(and(eq(calls.id, callId), eq(calls.status, 'scheduled')));
    }
    return {
      call,
      lead: await leadForDeal(tx, call.dealId),
      sender: await organizationSender(tx, call.organizationId),
      manageToken: token,
    };
  });
}

function portalUrl(appBaseUrl: string, locale: Locale): string {
  return new URL(locale === 'pt-PT' ? '/portal' : `/${locale}/portal`, appBaseUrl).toString();
}

/**
 * The booking management page only serves the discovery call, so proposal session emails
 * carry the meeting link (or the portal) as their single action instead of a manage link.
 */
async function sendSessionEmail(
  deps: NotificationDeps,
  template: 'lead.session_confirmed' | 'lead.session_reminder',
  input: { to: string; call: CallContext; locale: Locale; sender: Sender; timeZone: string },
): Promise<void> {
  await send(deps, {
    to: input.to,
    template,
    locale: input.locale,
    sender: input.sender,
    organizationId: input.call.organizationId,
    params: {
      firstName: (input.call.contactName ?? '').trim().split(/\s+/)[0] ?? '',
      agencyName: input.sender.agencyName,
      startsAtLabel: startsAtLabel(input.call.startsAt, input.locale, input.timeZone),
      joinUrl: input.call.meetUrl ?? portalUrl(deps.appBaseUrl, input.locale),
    },
  });
}

export type PortalNoticeTemplate =
  | 'lead.proof_comment'
  | 'lead.rounds_warning'
  | 'lead.briefing_shared'
  | 'lead.presentation_shared'
  | 'lead.proposal_shared'
  | 'lead.contract_ready'
  | 'lead.contract_signed'
  | 'lead.payment_requested'
  | 'lead.payment_reminder'
  | 'lead.payment_overdue'
  | 'lead.payment_received'
  | 'lead.room_update'
  | 'lead.step_shared'
  | 'lead.approval_requested'
  | 'lead.approval_reminder';

/** Tells the decision maker with portal access that something new was shared with them. */
export async function sendPortalNotice(
  dealId: string,
  template: PortalNoticeTemplate,
  deps: NotificationDeps,
): Promise<boolean> {
  const context = await deps.contexts.withSystemContext(async (tx) => {
    const [deal] = await tx
      .select({ organizationId: deals.organizationId, clientId: deals.clientId })
      .from(deals)
      .where(eq(deals.id, dealId));
    if (!deal) return null;
    const [contact] = await tx
      .select({ email: contacts.email, fullName: contacts.fullName })
      .from(contacts)
      .where(
        and(
          eq(contacts.clientId, deal.clientId),
          eq(contacts.role, 'decision_maker'),
          isNotNull(contacts.portalUserId),
          isNotNull(contacts.email),
        ),
      )
      .limit(1);
    if (!contact?.email) return null;
    return {
      organizationId: deal.organizationId,
      to: contact.email,
      firstName: contact.fullName.trim().split(/\s+/)[0] ?? '',
      lead: await leadForDeal(tx, dealId),
      sender: await organizationSender(tx, deal.organizationId),
    };
  });
  if (!context) return false;
  const locale = context.lead?.locale ?? context.sender.defaultLocale;

  await send(deps, {
    to: context.to,
    template,
    locale,
    sender: context.sender,
    organizationId: context.organizationId,
    params: {
      firstName: context.firstName,
      agencyName: context.sender.agencyName,
      portalUrl: portalUrl(deps.appBaseUrl, locale),
    },
  });
  return true;
}

async function latestDealOf(tx: DbTransaction, clientId: string): Promise<string | null> {
  const [deal] = await tx
    .select({ id: deals.id })
    .from(deals)
    .where(eq(deals.clientId, clientId))
    .orderBy(desc(deals.createdAt))
    .limit(1);
  return deal?.id ?? null;
}

/**
 * Tells the client's decision maker with portal access that something new waits in the portal,
 * for notices about a client rather than a deal (a project may have no deal).
 */
export async function sendClientPortalNotice(
  clientId: string,
  template: PortalNoticeTemplate,
  deps: NotificationDeps,
): Promise<boolean> {
  const dealId = await deps.contexts.withSystemContext((tx) => latestDealOf(tx, clientId));
  if (dealId) return sendPortalNotice(dealId, template, deps);
  const context = await deps.contexts.withSystemContext(async (tx) => {
    const [client] = await tx
      .select({ organizationId: clients.organizationId })
      .from(clients)
      .where(eq(clients.id, clientId));
    if (!client) return null;
    const [contact] = await tx
      .select({ email: contacts.email, fullName: contacts.fullName })
      .from(contacts)
      .where(
        and(
          eq(contacts.clientId, clientId),
          eq(contacts.role, 'decision_maker'),
          isNotNull(contacts.portalUserId),
          isNotNull(contacts.email),
        ),
      )
      .limit(1);
    if (!contact?.email) return null;
    return {
      organizationId: client.organizationId,
      to: contact.email,
      firstName: contact.fullName.trim().split(/\s+/)[0] ?? '',
      sender: await organizationSender(tx, client.organizationId),
    };
  });
  if (!context) return false;
  const locale = context.sender.defaultLocale;
  await send(deps, {
    to: context.to,
    template,
    locale,
    sender: context.sender,
    organizationId: context.organizationId,
    params: {
      firstName: context.firstName,
      agencyName: context.sender.agencyName,
      portalUrl: portalUrl(deps.appBaseUrl, locale),
    },
  });
  return true;
}

export async function clientTimeZone(
  clientId: string,
  deps: Pick<NotificationDeps, 'contexts'>,
): Promise<string> {
  const dealId = await deps.contexts.withSystemContext((tx) => latestDealOf(tx, clientId));
  return dealId ? leadTimeZoneForDeal(dealId, deps) : resolveTimeZone(null, 'Europe/Lisbon');
}

export async function leadTimeZoneForDeal(
  dealId: string,
  deps: Pick<NotificationDeps, 'contexts'>,
): Promise<string> {
  const lead = await deps.contexts.withSystemContext((tx) => leadForDeal(tx, dealId));
  return resolveTimeZone(lead?.timeZone ?? null, 'Europe/Lisbon');
}

export async function sendCallConfirmation(
  callId: string,
  deps: NotificationDeps,
): Promise<boolean> {
  const context = await leadCallMessage(callId, deps);
  const to = context?.call.contactEmail;
  if (!context || context.call.status !== 'scheduled' || !to) return false;
  const { call, lead, sender, manageToken: token } = context;
  const locale = lead?.locale ?? sender.defaultLocale;
  const timeZone = resolveTimeZone(call.leadTimeZone, 'Europe/Lisbon');

  if (call.kind === 'proposal_session') {
    await sendSessionEmail(deps, 'lead.session_confirmed', { to, call, locale, sender, timeZone });
    return true;
  }
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
      manageUrl: manageUrl(deps.appBaseUrl, token),
    },
  });
  return true;
}

export async function sendCallReminder(
  callId: string,
  expectedStartsAt: Date,
  deps: NotificationDeps,
): Promise<'sent' | 'skipped'> {
  const context = await leadCallMessage(callId, deps);
  const to = context?.call.contactEmail;
  if (
    !context ||
    !to ||
    context.call.status !== 'scheduled' ||
    context.call.startsAt.getTime() !== expectedStartsAt.getTime()
  ) {
    return 'skipped';
  }
  const { call, lead, sender, manageToken: token } = context;
  const locale = lead?.locale ?? sender.defaultLocale;

  if (call.kind === 'proposal_session') {
    await sendSessionEmail(deps, 'lead.session_reminder', {
      to,
      call,
      locale,
      sender,
      timeZone: resolveTimeZone(call.leadTimeZone, 'Europe/Lisbon'),
    });
    return 'sent';
  }
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
      manageUrl: manageUrl(deps.appBaseUrl, token),
    },
  });
  return 'sent';
}

export async function sendBookingCancelled(
  callId: string,
  deps: NotificationDeps,
): Promise<boolean> {
  const context = await leadCallMessage(callId, deps);
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
