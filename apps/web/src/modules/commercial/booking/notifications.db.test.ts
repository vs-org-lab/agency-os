import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  addOrganizationMember,
  closeTestSql,
  createAuthUser,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
  type World,
} from '@agency-os/db/testing';
import type { EmailPort, OutgoingEmail } from '@/modules/email';
import { createDbContexts } from '@/platform/db';
import type { CalendarPort } from '../calendar/port';
import { hashManageToken } from './links';
import {
  alertFounders,
  sendBookingLinkEmail,
  sendCallConfirmation,
  sendCallReminder,
  type NotificationDeps,
} from './notifications';
import { syncCallEvent } from './service';

afterAll(async () => {
  await closeTestSql();
});

const STARTS_AT = new Date('2026-10-13T09:00:00Z');

function recordingEmail(): EmailPort & { sent: OutgoingEmail[] } {
  const sent: OutgoingEmail[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}

async function bookedCall(sql: TransactionSql, world: World) {
  const [contact] = await sql<{ id: string }[]>`
    insert into public.contacts (organization_id, client_id, full_name, email, role)
    values (${world.organizationId}, ${world.clients.a}, 'Ana Costa', 'ana@empresa.pt', 'decision_maker')
    returning id
  `;
  const [deal] = await sql<{ id: string }[]>`
    insert into public.deals (organization_id, client_id, title, pipeline_code, source)
    values (${world.organizationId}, ${world.clients.a}, 'Empresa Exemplo', '0.3', 'application')
    returning id
  `;
  const [form] = await sql<{ id: string }[]>`
    insert into public.application_forms (organization_id, version, definition)
    values (${world.organizationId}, 9, '{}'::jsonb) returning id
  `;
  await sql`
    insert into public.applications (organization_id, client_id, contact_id, deal_id, form_id, answers,
                                     score, path, source, consent_at, consent_text_version)
    values (${world.organizationId}, ${world.clients.a}, ${contact?.id ?? ''}, ${deal?.id ?? ''}, ${form?.id ?? ''},
            '{}'::jsonb, 11, 'a', '{"locale":"en","timeZone":"Africa/Luanda"}'::jsonb, now(), '2026-10')
  `;
  const [call] = await sql<{ id: string }[]>`
    insert into public.calls (organization_id, client_id, deal_id, contact_id, host_user_id,
                              starts_at, ends_at, lead_time_zone)
    values (${world.organizationId}, ${world.clients.a}, ${deal?.id ?? ''}, ${contact?.id ?? ''},
            ${world.users.founder}, ${STARTS_AT.toISOString()}, ${new Date(STARTS_AT.getTime() + 45 * 60_000).toISOString()},
            'Africa/Luanda')
    returning id
  `;
  return { callId: call?.id ?? '', dealId: deal?.id ?? '' };
}

function depsFor(sql: TransactionSql, email: EmailPort): NotificationDeps {
  return {
    contexts: createDbContexts(testDatabase(sql)),
    email,
    appBaseUrl: 'https://os.example.com',
    linkSecret: 'a-secret-that-is-long-enough-for-hmac-signing',
    now: () => new Date('2026-10-12T08:00:00Z'),
  };
}

describe('notifications', () => {
  it('confirmation and reminder carry the same working manage link', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { callId } = await bookedCall(sql, world);
      const email = recordingEmail();
      const deps = depsFor(sql, email);

      await sendCallConfirmation(callId, deps);
      await sendCallReminder(callId, STARTS_AT, deps);

      expect(email.sent).toHaveLength(2);
      expect(email.sent[0]).toMatchObject({
        to: 'ana@empresa.pt',
        template: 'lead.booking_confirmed',
      });
      expect(email.sent[0]?.subject).toContain('Call booked');
      const tokens = email.sent.map(
        (message) => /apply\/booking\/([A-Za-z0-9_-]+)/.exec(message.text)?.[1] ?? '',
      );
      expect(tokens[0]).not.toBe('');
      expect(tokens[1]).toBe(tokens[0]);
      await sql`reset role`;
      const [call] = await sql<{ hash: string }[]>`
        select manage_token_hash as hash from public.calls where id = ${callId}
      `;
      expect(call?.hash).toBe(hashManageToken(tokens[1] ?? ''));
      expect(email.sent[0]?.text).toContain('10:00');
    });
  });

  it('reminder is skipped when the call was rescheduled', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { callId } = await bookedCall(sql, world);
      const email = recordingEmail();
      const deps = depsFor(sql, email);

      expect(await sendCallReminder(callId, new Date('2026-10-14T09:00:00Z'), deps)).toBe(
        'skipped',
      );
      expect(await sendCallReminder(callId, STARTS_AT, deps)).toBe('sent');
      await sql`update public.calls set status = 'cancelled' where id = ${callId}`;
      expect(await sendCallReminder(callId, STARTS_AT, deps)).toBe('skipped');
      expect(email.sent.map((message) => message.template)).toEqual(['lead.call_reminder']);
    });
  });

  it('alerts every active founder', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const partner = await createAuthUser(sql, {
        fullName: 'Second Founder',
        kind: 'internal',
        email: 'partner@studio.example',
      });
      await addOrganizationMember(sql, {
        organizationId: world.organizationId,
        userId: partner,
        role: 'founder',
      });
      const email = recordingEmail();

      await alertFounders(
        world.organizationId,
        'founder.queue_b_pending',
        { companyName: 'Empresa Exemplo', queueUrl: 'https://os.example.com/applications' },
        depsFor(sql, email),
      );

      expect(email.sent.map((message) => message.to)).toContain('partner@studio.example');
      expect(email.sent).toHaveLength(2);
    });
  });

  it('sends the booking link in the applicant language', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { dealId } = await bookedCall(sql, world);
      const email = recordingEmail();

      await sendBookingLinkEmail(dealId, depsFor(sql, email));

      expect(email.sent[0]).toMatchObject({ to: 'ana@empresa.pt', template: 'lead.booking_link' });
      expect(email.sent[0]?.text).toContain('https://os.example.com/apply/book?token=');
      expect(email.sent[0]?.subject).toContain('Your call');
    });
  });

  it('sync retries a pending call and stores the Meet link', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { callId } = await bookedCall(sql, world);
      const port: CalendarPort = {
        freeBusy: async () => [],
        createEvent: async () => ({ eventId: 'event-9', meetUrl: 'https://meet.google.com/xyz' }),
        updateEvent: async () => 'updated',
        deleteEvent: async () => undefined,
      };

      await syncCallEvent(callId, port, createDbContexts(testDatabase(sql)));

      const [call] = await sql<{ sync: string; meet: string }[]>`
        select sync_status::text as sync, meet_url as meet from public.calls where id = ${callId}
      `;
      expect(call).toEqual({ sync: 'synced', meet: 'https://meet.google.com/xyz' });
    });
  });
});
