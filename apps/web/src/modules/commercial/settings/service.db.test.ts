import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { DEFAULT_APPLICATION_FORM } from '../applications/default-form';
import { DEFAULT_BOOKING_RULES } from '../booking/slots';
import {
  getCommercialSettings,
  publishApplicationForm,
  saveMessageTemplate,
  updateBookingSettings,
} from './service';

afterAll(async () => {
  await closeTestSql();
});

function claimsFor(userId: string): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
  };
}

const BOOKING = {
  timeZone: 'Europe/Lisbon',
  weeklyHours: DEFAULT_BOOKING_RULES.weeklyHours,
  durationMinutes: 60,
  bufferMinutes: 15,
  minimumNoticeHours: 12,
  horizonDays: 21,
  selfDiagnosisUrl: 'https://aurion.example/autodiagnostico',
  anonymizeAfterMonths: 18,
};

describe('commercial settings', () => {
  it('publishing creates a new active version and keeps the old one', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));
      const claims = claimsFor(world.users.founder);

      const first = await publishApplicationForm(claims, DEFAULT_APPLICATION_FORM, { contexts });
      const second = await publishApplicationForm(
        claims,
        { ...DEFAULT_APPLICATION_FORM, thresholds: { a: 10, b: 6 } },
        { contexts },
      );

      expect(first).toEqual({ ok: true, version: 1 });
      expect(second).toEqual({ ok: true, version: 2 });
      await sql`reset role`;
      const rows = await sql<{ version: number; active: boolean }[]>`
        select version, is_active as active from public.application_forms
        where organization_id = ${world.organizationId} order by version
      `;
      expect(rows).toEqual([
        { version: 1, active: false },
        { version: 2, active: true },
      ]);
    });
  });

  it('rejects an invalid definition', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));

      const result = await publishApplicationForm(
        claimsFor(world.users.founder),
        { ...DEFAULT_APPLICATION_FORM, thresholds: { a: 5, b: 6 } },
        { contexts },
      );

      expect(result).toMatchObject({ ok: false });
    });
  });

  it('only the founder can change commercial settings', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));

      expect(
        await updateBookingSettings(claimsFor(world.users.manager), BOOKING, { contexts }),
      ).toEqual({ ok: false, rule: 'forbidden' });
      expect(
        await publishApplicationForm(claimsFor(world.users.manager), DEFAULT_APPLICATION_FORM, {
          contexts,
        }),
      ).toEqual({ ok: false, issues: ['forbidden'] });
      expect(
        await saveMessageTemplate(
          claimsFor(world.users.finance),
          {
            templateId: null,
            kind: 'acquisition',
            sector: 'energy',
            sequenceDay: null,
            locale: 'pt-PT',
            name: 'Energia',
            subject: null,
            body: 'Olá {firstName}',
          },
          { contexts },
        ),
      ).toEqual({ ok: false, rule: 'forbidden' });
    });
  });

  it('booking settings are saved and read back', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));
      const claims = claimsFor(world.users.founder);

      expect(await updateBookingSettings(claims, BOOKING, { contexts })).toEqual({ ok: true });
      const settings = await contexts.withUserContext(claims, (tx) =>
        getCommercialSettings(tx, world.organizationId),
      );
      expect(settings).toMatchObject({
        durationMinutes: 60,
        horizonDays: 21,
        selfDiagnosisUrl: 'https://aurion.example/autodiagnostico',
        anonymizeAfterMonths: 18,
      });
    });
  });

  it('booking settings validation rejects end before start', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));

      const result = await updateBookingSettings(
        claimsFor(world.users.founder),
        {
          ...BOOKING,
          weeklyHours: { ...BOOKING.weeklyHours, mon: [{ start: '18:00', end: '10:00' }] },
        },
        { contexts },
      );

      expect(result).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });
});
