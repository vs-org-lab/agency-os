import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
  type World,
} from '@agency-os/db/testing';
import { createDbContexts } from '@/platform/db';
import { signToken } from '@/platform/signed-token';
import {
  CalendarUnavailableError,
  type CalendarEventInput,
  type CalendarPort,
} from '../calendar/port';
import { bookingLinkToken, hashManageToken } from './links';
import {
  bookCall,
  cancelCall,
  listSlots,
  rescheduleCall,
  resolveBookingAccess,
  type BookingDeps,
} from './service';

afterAll(async () => {
  await closeTestSql();
});

const SECRET = 'a-secret-that-is-long-enough-for-hmac-signing';
const NOW = new Date('2026-10-12T08:00:00Z');
const FIRST_SLOT = new Date('2026-10-13T09:00:00Z');

type FakeCalendar = CalendarPort & { created: CalendarEventInput[]; deleted: string[] };

function fakeCalendar(options: { failCreate?: boolean } = {}): FakeCalendar {
  const created: CalendarEventInput[] = [];
  const deleted: string[] = [];
  return {
    created,
    deleted,
    async freeBusy() {
      return [];
    },
    async createEvent(input) {
      if (options.failCreate) throw new CalendarUnavailableError('provider_error');
      created.push(input);
      return {
        eventId: `event-${created.length}`,
        meetUrl: 'https://meet.google.com/abc-defg-hij',
      };
    },
    async updateEvent() {
      return;
    },
    async deleteEvent(eventId) {
      deleted.push(eventId);
    },
  };
}

async function prospectDeal(sql: TransactionSql, world: World, clientId: string, code = '0.2') {
  const [contact] = await sql<{ id: string }[]>`
    insert into public.contacts (organization_id, client_id, full_name, email, role)
    values (${world.organizationId}, ${clientId}, 'Ana Costa', ${`ana-${clientId}@empresa.pt`}, 'decision_maker')
    returning id
  `;
  const [deal] = await sql<{ id: string }[]>`
    insert into public.deals (organization_id, client_id, title, pipeline_code, source)
    values (${world.organizationId}, ${clientId}, 'Empresa Exemplo', ${code}, 'application')
    returning id
  `;
  return { dealId: deal?.id ?? '', contactId: contact?.id ?? '' };
}

function depsFor(sql: TransactionSql, world: World, calendar: CalendarPort | null): BookingDeps {
  return {
    contexts: createDbContexts(testDatabase(sql)),
    linkSecret: SECRET,
    now: () => NOW,
    calendar: async () => (calendar ? { port: calendar, hostUserId: world.users.founder } : null),
    flush: async () => {},
  };
}

async function dealCode(sql: TransactionSql, dealId: string): Promise<string> {
  await sql`reset role`;
  const [row] = await sql<{ code: string }[]>`
    select pipeline_code::text as code from public.deals where id = ${dealId}
  `;
  return row?.code ?? '';
}

async function linkAccess(deps: BookingDeps, dealId: string) {
  const access = await resolveBookingAccess(
    { kind: 'link', token: bookingLinkToken(dealId, SECRET, NOW) },
    deps,
  );
  if (!access) throw new Error('expected booking access');
  return access;
}

describe('booking service', () => {
  it('books a free slot, moves the deal to 0.3 and creates the calendar event', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { dealId } = await prospectDeal(sql, world, world.clients.a);
      const calendar = fakeCalendar();
      const deps = depsFor(sql, world, calendar);

      const access = await linkAccess(deps, dealId);
      const slots = await listSlots(access, deps);
      expect(slots.status).toBe('available');
      if (slots.status !== 'available') return;
      expect(slots.slots[0]?.toISOString()).toBe(FIRST_SLOT.toISOString());

      const result = await bookCall(
        access,
        { start: FIRST_SLOT, leadTimeZone: 'Africa/Luanda', ipAddress: null },
        deps,
      );

      expect(result).toMatchObject({
        status: 'booked',
        meetUrl: 'https://meet.google.com/abc-defg-hij',
      });
      expect(await dealCode(sql, dealId)).toBe('0.3');
      expect(calendar.created[0]).toMatchObject({
        start: FIRST_SLOT,
        end: new Date('2026-10-13T09:45:00Z'),
        attendee: { email: `ana-${world.clients.a}@empresa.pt`, name: 'Ana Costa' },
      });
      const [call] = await sql<{ sync: string; zone: string; event: string }[]>`
        select sync_status::text as sync, lead_time_zone as zone, external_event_id as event
        from public.calls where deal_id = ${dealId}
      `;
      expect(call).toEqual({ sync: 'synced', zone: 'Africa/Luanda', event: 'event-1' });
    });
  });

  it('concurrent bookings for the same slot book only one', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const first = await prospectDeal(sql, world, world.clients.a);
      const second = await prospectDeal(sql, world, world.clients.b);
      const deps = depsFor(sql, world, fakeCalendar());

      const input = { start: FIRST_SLOT, leadTimeZone: 'Europe/Lisbon', ipAddress: null };
      const firstResult = await bookCall(await linkAccess(deps, first.dealId), input, deps);
      const secondResult = await bookCall(await linkAccess(deps, second.dealId), input, deps);

      expect([firstResult.status, secondResult.status]).toEqual(['booked', 'slot_taken']);
      expect(await dealCode(sql, second.dealId)).toBe('0.2');
    });
  });

  it('refuses a slot that is no longer available', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { dealId } = await prospectDeal(sql, world, world.clients.a);
      const deps = depsFor(sql, world, fakeCalendar());

      const result = await bookCall(
        await linkAccess(deps, dealId),
        { start: new Date('2026-10-13T09:05:00Z'), leadTimeZone: 'Europe/Lisbon', ipAddress: null },
        deps,
      );

      expect(result).toEqual({ status: 'slot_taken' });
      expect(await dealCode(sql, dealId)).toBe('0.2');
    });
  });

  it('calendar failure after commit keeps the call pending', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { dealId } = await prospectDeal(sql, world, world.clients.a);
      const deps = depsFor(sql, world, fakeCalendar({ failCreate: true }));

      const result = await bookCall(
        await linkAccess(deps, dealId),
        { start: FIRST_SLOT, leadTimeZone: 'Europe/Lisbon', ipAddress: null },
        deps,
      );

      expect(result).toMatchObject({ status: 'booked', meetUrl: null });
      const [call] = await sql<{ sync: string }[]>`
        select sync_status::text as sync from public.calls where deal_id = ${dealId}
      `;
      expect(call?.sync).toBe('pending');
      expect(await dealCode(sql, dealId)).toBe('0.3');
    });
  });

  it('without a calendar connection slots are unavailable and an event is emitted', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { dealId } = await prospectDeal(sql, world, world.clients.a);
      const deps = depsFor(sql, world, null);

      expect(await listSlots(await linkAccess(deps, dealId), deps)).toEqual({
        status: 'unavailable',
      });
      const [event] = await sql<{ type: string }[]>`
        select type from public.domain_events
        where organization_id = ${world.organizationId} and type = 'commercial.calendar.unavailable'
      `;
      expect(event).toBeDefined();
    });
  });

  it('booking link stops working once the deal leaves 0.2', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { dealId } = await prospectDeal(sql, world, world.clients.a, 'X.4');
      const deps = depsFor(sql, world, fakeCalendar());

      const access = await linkAccess(deps, dealId);
      expect(await listSlots(access, deps)).toEqual({ status: 'closed' });
      expect(
        await bookCall(
          access,
          { start: FIRST_SLOT, leadTimeZone: 'Europe/Lisbon', ipAddress: null },
          deps,
        ),
      ).toEqual({ status: 'closed' });
    });
  });

  it('rejects tokens of another purpose', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { dealId } = await prospectDeal(sql, world, world.clients.a);
      const deps = depsFor(sql, world, fakeCalendar());
      const thanksToken = signToken(
        'apply_thanks',
        { dealId },
        SECRET,
        new Date(NOW.getTime() + 60_000),
      );

      expect(await resolveBookingAccess({ kind: 'link', token: thanksToken }, deps)).toBeNull();
    });
  });

  it('manage link refuses changes less than 2 hours before the call', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { dealId } = await prospectDeal(sql, world, world.clients.a);
      const deps = depsFor(sql, world, fakeCalendar());
      const booked = await bookCall(
        await linkAccess(deps, dealId),
        { start: FIRST_SLOT, leadTimeZone: 'Europe/Lisbon', ipAddress: null },
        deps,
      );
      if (booked.status !== 'booked') throw new Error('expected a booking');
      const manageToken = 'manage-token-for-test';
      await sql`
        update public.calls set manage_token_hash = ${hashManageToken(manageToken)} where id = ${booked.callId}
      `;
      const late = { ...deps, now: () => new Date(FIRST_SLOT.getTime() - 90 * 60_000) };

      expect(await cancelCall(manageToken, late)).toEqual({ status: 'too_late' });
      expect(
        await rescheduleCall(
          manageToken,
          { start: new Date('2026-10-14T09:00:00Z'), leadTimeZone: 'Europe/Lisbon' },
          late,
        ),
      ).toEqual({ status: 'too_late' });
    });
  });

  it('cancel returns the deal to 0.2 and frees the slot', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { dealId } = await prospectDeal(sql, world, world.clients.a);
      const calendar = fakeCalendar();
      const deps = depsFor(sql, world, calendar);
      const booked = await bookCall(
        await linkAccess(deps, dealId),
        { start: FIRST_SLOT, leadTimeZone: 'Europe/Lisbon', ipAddress: null },
        deps,
      );
      if (booked.status !== 'booked') throw new Error('expected a booking');
      const manageToken = 'manage-token-for-cancel';
      await sql`
        update public.calls set manage_token_hash = ${hashManageToken(manageToken)} where id = ${booked.callId}
      `;

      expect(await cancelCall(manageToken, deps)).toEqual({ status: 'cancelled' });

      expect(await dealCode(sql, dealId)).toBe('0.2');
      expect(calendar.deleted).toEqual(['event-1']);
      const access = await resolveBookingAccess({ kind: 'manage', token: manageToken }, deps);
      const slots = access ? await listSlots(access, deps) : null;
      expect(slots?.status === 'available' && slots.slots[0]?.toISOString()).toBe(
        FIRST_SLOT.toISOString(),
      );
    });
  });

  it('reschedule moves the call and keeps the deal at 0.3', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { dealId } = await prospectDeal(sql, world, world.clients.a);
      const deps = depsFor(sql, world, fakeCalendar());
      const booked = await bookCall(
        await linkAccess(deps, dealId),
        { start: FIRST_SLOT, leadTimeZone: 'Europe/Lisbon', ipAddress: null },
        deps,
      );
      if (booked.status !== 'booked') throw new Error('expected a booking');
      const manageToken = 'manage-token-for-reschedule';
      await sql`
        update public.calls set manage_token_hash = ${hashManageToken(manageToken)} where id = ${booked.callId}
      `;
      const later = new Date('2026-10-14T09:00:00Z');

      expect(
        await rescheduleCall(manageToken, { start: later, leadTimeZone: 'Europe/Lisbon' }, deps),
      ).toEqual({ status: 'rescheduled', startsAt: later });
      expect(await dealCode(sql, dealId)).toBe('0.3');
      const [call] = await sql<{ starts: Date }[]>`
        select starts_at as starts from public.calls where id = ${booked.callId}
      `;
      expect(new Date(call?.starts ?? 0).toISOString()).toBe(later.toISOString());
    });
  });
});
