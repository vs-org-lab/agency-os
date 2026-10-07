import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts } from '@/platform/db';
import { submitApplication, type SubmitApplicationInput } from './submit';

afterAll(async () => {
  await closeTestSql();
});

const NOW = new Date('2026-10-07T12:00:00Z');
const SECRET = 'a-secret-that-is-long-enough-for-hmac-signing';

function submission(
  overrides: Partial<SubmitApplicationInput> & {
    choices?: Record<string, string>;
    email?: string;
  } = {},
): SubmitApplicationInput {
  const { choices, email, ...rest } = overrides;
  return {
    answers: {
      contact: { fullName: 'Ana Costa', email: email ?? 'ana@empresa.pt' },
      company: { name: 'Empresa Exemplo', website: 'https://empresa.pt' },
      choices: {
        role: 'ceo_founder_partner',
        sector: 'consulting',
        revenue: 'over_20m',
        priority: 'brand_and_site',
        investment: 'over_50k',
        timing: 'this_quarter',
        ...choices,
      },
      texts: { cost_of_inaction: 'Perdemos dois contratos por ano.' },
    },
    source: {
      utm: { source: 'linkedin', campaign: 'outubro' },
      landingPage: '/diagnostico',
      referrer: 'https://www.linkedin.com/',
      timeZone: 'Europe/Lisbon',
    },
    consentAccepted: true,
    consentTextVersion: '2026-10',
    honeypot: '',
    startedAt: NOW.getTime() - 120_000,
    ipAddress: '203.0.113.7',
    locale: 'pt-PT',
    ...rest,
  };
}

async function setup(sql: TransactionSql) {
  const world = await createFixtureWorld(sql);
  const [organization] = await sql<{ slug: string }[]>`
    select slug from public.organizations where id = ${world.organizationId}
  `;
  const deps = {
    contexts: createDbContexts(testDatabase(sql)),
    organizationSlug: organization?.slug ?? '',
    linkSecret: SECRET,
    now: () => NOW,
    flush: async () => {},
  };
  return { world, deps };
}

async function dealOf(sql: TransactionSql, dealId: string) {
  await sql`reset role`;
  const [deal] = await sql<{ code: string; lost_reason: string | null; source: string }[]>`
    select pipeline_code::text as code, lost_reason, source::text from public.deals where id = ${dealId}
  `;
  return deal;
}

describe('submitApplication', () => {
  it('path a creates prospect, contact, application and deal at 0.2', async () => {
    await withTestTransaction(async (sql) => {
      const { world, deps } = await setup(sql);

      const result = await submitApplication(submission(), deps);

      expect(result).toMatchObject({ status: 'accepted', path: 'a' });
      if (result.status !== 'accepted') return;
      expect(await dealOf(sql, result.dealId)).toEqual({
        code: '0.2',
        lost_reason: null,
        source: 'application',
      });
      const [client] = await sql<{ lifecycle: string; name: string; website: string }[]>`
        select c.lifecycle::text, c.name, c.website from public.clients c
        join public.deals d on d.client_id = c.id where d.id = ${result.dealId}
      `;
      expect(client).toEqual({
        lifecycle: 'prospect',
        name: 'Empresa Exemplo',
        website: 'https://empresa.pt',
      });
      const [contact] = await sql<{ role: string; email: string }[]>`
        select role::text, email from public.contacts
        where organization_id = ${world.organizationId}
      `;
      expect(contact).toEqual({ role: 'decision_maker', email: 'ana@empresa.pt' });
      const [event] = await sql<{ type: string }[]>`
        select type from public.domain_events
        where organization_id = ${world.organizationId} and type = 'commercial.application.submitted'
      `;
      expect(event).toBeDefined();
    });
  });

  it('path c closes the new deal at X.4 with reason path_c', async () => {
    await withTestTransaction(async (sql) => {
      const { deps } = await setup(sql);

      const result = await submitApplication(
        submission({ choices: { investment: 'under_10k' } }),
        deps,
      );

      expect(result).toMatchObject({ status: 'accepted', path: 'c' });
      if (result.status !== 'accepted') return;
      expect(await dealOf(sql, result.dealId)).toMatchObject({
        code: 'X.4',
        lost_reason: 'path_c',
      });
    });
  });

  it('stores form version, score, knockouts, source and consent timestamp', async () => {
    await withTestTransaction(async (sql) => {
      const { deps } = await setup(sql);

      const result = await submitApplication(
        submission({ choices: { investment: 'under_10k' } }),
        deps,
      );
      if (result.status !== 'accepted') throw new Error('expected an accepted application');

      const [application] = await sql<
        {
          version: number;
          score: number;
          knockouts: string[];
          source: Record<string, unknown>;
          consent_at: Date;
          consent_text_version: string;
        }[]
      >`
        select f.version, a.score, a.knockouts, a.source, a.consent_at, a.consent_text_version
        from public.applications a join public.application_forms f on f.id = a.form_id
        where a.id = ${result.applicationId}
      `;
      expect(application).toMatchObject({
        version: 1,
        score: 10,
        knockouts: ['investment'],
        consent_text_version: '2026-10',
        source: {
          utm: { source: 'linkedin', campaign: 'outubro' },
          landingPage: '/diagnostico',
          referrer: 'https://www.linkedin.com/',
          timeZone: 'Europe/Lisbon',
        },
      });
      expect(new Date(application?.consent_at ?? 0).toISOString()).toBe(NOW.toISOString());
    });
  });

  it('normalises email before matching the contact', async () => {
    await withTestTransaction(async (sql) => {
      const { world, deps } = await setup(sql);

      const first = await submitApplication(submission(), deps);
      const second = await submitApplication(submission({ email: '  ANA@Empresa.PT ' }), deps);

      expect(first.status).toBe('accepted');
      expect(second.status).toBe('accepted');
      const contacts = await sql<{ email: string }[]>`
        select email from public.contacts where organization_id = ${world.organizationId}
      `;
      expect(contacts).toEqual([{ email: 'ana@empresa.pt' }]);
    });
  });

  it('repeat application attaches to the open deal without changing its stage', async () => {
    await withTestTransaction(async (sql) => {
      const { world, deps } = await setup(sql);
      const first = await submitApplication(submission(), deps);
      if (first.status !== 'accepted') throw new Error('expected an accepted application');
      await sql`update public.deals set pipeline_code = 'X.2' where id = ${first.dealId}`;

      const second = await submitApplication(
        submission({ choices: { investment: 'under_10k' } }),
        deps,
      );

      expect(second).toMatchObject({ status: 'accepted', path: 'c', dealId: first.dealId });
      expect(await dealOf(sql, first.dealId)).toMatchObject({ code: 'X.2' });
      const deals =
        await sql`select id from public.deals where organization_id = ${world.organizationId}`;
      expect(deals).toHaveLength(1);
    });
  });

  it('honeypot and fast submissions are discarded without writes', async () => {
    await withTestTransaction(async (sql) => {
      const { world, deps } = await setup(sql);

      expect(await submitApplication(submission({ honeypot: 'filled' }), deps)).toEqual({
        status: 'discarded',
      });
      expect(
        await submitApplication(submission({ startedAt: NOW.getTime() - 1_000 }), deps),
      ).toEqual({ status: 'discarded' });
      const rows =
        await sql`select id from public.applications where organization_id = ${world.organizationId}`;
      expect(rows).toHaveLength(0);
    });
  });

  it('applies the configured hourly limit per ip address', async () => {
    await withTestTransaction(async (sql) => {
      const { deps } = await setup(sql);
      const limited = { ...deps, ipLimitPerHour: 1 };

      const first = await submitApplication(submission({ email: 'um@empresa.pt' }), limited);
      const second = await submitApplication(submission({ email: 'dois@empresa.pt' }), limited);

      expect([first.status, second.status]).toEqual(['accepted', 'throttled']);
    });
  });

  it('fourth application from the same email in a day is throttled', async () => {
    await withTestTransaction(async (sql) => {
      const { deps } = await setup(sql);

      const statuses = [];
      for (let index = 0; index < 4; index += 1) {
        const result = await submitApplication(
          submission({ ipAddress: `203.0.113.${index + 10}` }),
          deps,
        );
        statuses.push(result.status);
      }

      expect(statuses).toEqual(['accepted', 'accepted', 'accepted', 'throttled']);
    });
  });

  it('invalid answers return issues without writes', async () => {
    await withTestTransaction(async (sql) => {
      const { world, deps } = await setup(sql);

      const result = await submitApplication(submission({ choices: { sector: 'mining' } }), deps);
      const withoutConsent = await submitApplication(submission({ consentAccepted: false }), deps);

      expect(result).toEqual({
        status: 'invalid',
        issues: [{ questionId: 'sector', code: 'invalid_option' }],
      });
      expect(withoutConsent).toEqual({
        status: 'invalid',
        issues: [{ questionId: 'consent', code: 'required' }],
      });
      const rows =
        await sql`select id from public.applications where organization_id = ${world.organizationId}`;
      expect(rows).toHaveLength(0);
    });
  });

  it('creates the default form version on first use', async () => {
    await withTestTransaction(async (sql) => {
      const { world, deps } = await setup(sql);

      await submitApplication(submission(), deps);
      await submitApplication(submission({ email: 'rui@outra.pt' }), deps);

      const forms = await sql<{ version: number; is_active: boolean }[]>`
        select version, is_active from public.application_forms
        where organization_id = ${world.organizationId}
      `;
      expect(forms).toEqual([{ version: 1, is_active: true }]);
    });
  });
});
