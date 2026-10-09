import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@agency-os/db';

export const DOMAIN_EVENTS = [
  'identity.user.invited',
  'commercial.application.submitted',
  'commercial.application.reviewed',
  'commercial.deal.stage_changed',
  'commercial.call.booked',
  'commercial.call.rescheduled',
  'commercial.call.cancelled',
  'commercial.call.completed',
  'commercial.calendar.unavailable',
  'core.briefing.shared',
  'core.document.shared',
  'core.recording.uploaded',
  'contracts.proposal.sent',
  'contracts.proposal.accepted',
  'contracts.proposal.change_requested',
  'contracts.contract.client_signed',
  'contracts.contract.signed',
  'billing.request.sent',
  'billing.request.reminded',
  'billing.request.overdue',
  'billing.request.overdue_alert',
  'billing.payment.received',
  'billing.payment.review',
] as const;

export type DomainEventType = (typeof DOMAIN_EVENTS)[number];

export type DomainEventInput = {
  type: DomainEventType;
  organizationId: string;
  clientId?: string | null;
  payload: unknown;
};

function isDomainEventType(value: string): value is DomainEventType {
  return (DOMAIN_EVENTS as readonly string[]).includes(value);
}

export async function emit(tx: DbExecutor, event: DomainEventInput): Promise<string> {
  if (!isDomainEventType(event.type)) {
    throw new Error(`Unknown domain event: ${String(event.type)}`);
  }

  const rows = await tx.execute<{ id: string }>(sql`
    select app.emit_event(
      ${event.organizationId}::uuid,
      ${event.clientId ?? null}::uuid,
      ${event.type},
      ${JSON.stringify(event.payload ?? {})}::jsonb
    ) as id
  `);

  const id = rows[0]?.id;
  if (!id) throw new Error('Domain event was not recorded');
  return id;
}
