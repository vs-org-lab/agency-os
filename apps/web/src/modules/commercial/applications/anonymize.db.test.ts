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
import { anonymizeExpiredApplications } from './anonymize';

afterAll(async () => {
  await closeTestSql();
});

const NOW = new Date('2027-11-01T03:30:00Z');

async function prospectApplication(
  sql: TransactionSql,
  world: World,
  input: { path: 'a' | 'b' | 'c'; dealCode: string; createdAt: string },
) {
  const [client] = await sql<{ id: string }[]>`
    insert into public.clients (organization_id, name, lifecycle, website)
    values (${world.organizationId}, 'Empresa Exemplo', 'prospect', 'https://empresa.pt')
    returning id
  `;
  const clientId = client?.id ?? '';
  const [contact] = await sql<{ id: string }[]>`
    insert into public.contacts (organization_id, client_id, full_name, email, phone, role)
    values (${world.organizationId}, ${clientId}, 'Ana Costa', 'ana@empresa.pt', '+351910000000', 'decision_maker')
    returning id
  `;
  const [deal] = await sql<{ id: string }[]>`
    insert into public.deals (organization_id, client_id, title, pipeline_code, source)
    values (${world.organizationId}, ${clientId}, 'Empresa Exemplo', ${input.dealCode}, 'application')
    returning id
  `;
  const [form] = await sql<{ id: string }[]>`
    insert into public.application_forms (organization_id, version, definition)
    values (${world.organizationId}, ${Math.floor(Math.random() * 1_000_000) + 2}, '{}'::jsonb)
    returning id
  `;
  const [application] = await sql<{ id: string }[]>`
    insert into public.applications (organization_id, client_id, contact_id, deal_id, form_id, answers,
                                     score, path, source, consent_at, consent_text_version, created_at)
    values (${world.organizationId}, ${clientId}, ${contact?.id ?? ''}, ${deal?.id ?? ''}, ${form?.id ?? ''},
            '{"texts":{"cost_of_inaction":"Perdemos contratos."}}'::jsonb, 4, ${input.path},
            '{"utm":{"source":"linkedin"}}'::jsonb, ${input.createdAt}, '2026-10', ${input.createdAt})
    returning id
  `;
  return {
    applicationId: application?.id ?? '',
    contactId: contact?.id ?? '',
    dealId: deal?.id ?? '',
    formId: form?.id ?? '',
    clientId,
  };
}

describe('anonymizeExpiredApplications', () => {
  it('anonymizes path c applications after the retention period', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const target = await prospectApplication(sql, world, {
        path: 'c',
        dealCode: 'X.4',
        createdAt: '2026-10-01T10:00:00Z',
      });

      const count = await anonymizeExpiredApplications(NOW, {
        contexts: createDbContexts(testDatabase(sql)),
      });

      expect(count).toBeGreaterThanOrEqual(1);
      const [application] = await sql<
        { answers: unknown; source: unknown; anonymized: boolean; score: number; path: string }[]
      >`
        select answers, source, anonymized_at is not null as anonymized, score, path::text
        from public.applications where id = ${target.applicationId}
      `;
      expect(application).toEqual({
        answers: {},
        source: {},
        anonymized: true,
        score: 4,
        path: 'c',
      });
      const [contact] = await sql<{ name: string; email: string | null; phone: string | null }[]>`
        select full_name as name, email, phone from public.contacts where id = ${target.contactId}
      `;
      expect(contact).toEqual({ name: '—', email: null, phone: null });
    });
  });

  it('removes personal data from every record of the anonymized client', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const target = await prospectApplication(sql, world, {
        path: 'c',
        dealCode: 'X.4',
        createdAt: '2026-10-01T10:00:00Z',
      });
      const [earlierDeal] = await sql<{ id: string }[]>`
        insert into public.deals (organization_id, client_id, title, pipeline_code, source, lost_reason)
        values (${world.organizationId}, ${target.clientId}, 'Empresa Exemplo · primeira candidatura',
                'X.4', 'application', 'Ana Costa preferiu outra agência')
        returning id
      `;
      const [earlier] = await sql<{ id: string }[]>`
        insert into public.applications (organization_id, client_id, contact_id, deal_id, form_id, answers,
                                         score, path, source, consent_at, consent_text_version, created_at)
        values (${world.organizationId}, ${target.clientId}, ${target.contactId}, ${earlierDeal?.id ?? ''},
                ${target.formId}, '{"texts":{"email":"ana@empresa.pt"}}'::jsonb, 11, 'a',
                '{"utm":{"source":"linkedin"}}'::jsonb, '2026-03-01T10:00:00Z', '2026-10', '2026-03-01T10:00:00Z')
        returning id
      `;
      const [secondContact] = await sql<{ id: string }[]>`
        insert into public.contacts (organization_id, client_id, full_name, email, role)
        values (${world.organizationId}, ${target.clientId}, 'Rui Lopes', 'rui@empresa.pt', 'operational')
        returning id
      `;
      const [call] = await sql<{ id: string }[]>`
        insert into public.calls (organization_id, client_id, deal_id, contact_id, host_user_id,
                                  starts_at, ends_at, status, notes)
        values (${world.organizationId}, ${target.clientId}, ${earlierDeal?.id ?? ''}, ${target.contactId},
                ${world.users.founder}, '2026-03-05T10:00:00Z', '2026-03-05T10:45:00Z', 'completed',
                'A Ana referiu a faturação de 2025.')
        returning id
      `;
      await sql`
        insert into public.follow_ups (organization_id, client_id, deal_id, call_id, due_on, sequence_day, suggested_message)
        values (${world.organizationId}, ${target.clientId}, ${earlierDeal?.id ?? ''}, ${call?.id ?? ''},
                '2026-03-08', 3, 'Olá Ana, ficou alguma dúvida sobre a Empresa Exemplo?')
      `;

      await anonymizeExpiredApplications(NOW, { contexts: createDbContexts(testDatabase(sql)) });

      const applications = await sql<{ answers: unknown; anonymized: boolean }[]>`
        select answers, anonymized_at is not null as anonymized from public.applications
        where id in (${target.applicationId}, ${earlier?.id ?? ''})
      `;
      expect(applications).toEqual([
        { answers: {}, anonymized: true },
        { answers: {}, anonymized: true },
      ]);
      const deals = await sql<{ title: string; lostReason: string | null }[]>`
        select title, lost_reason as "lostReason" from public.deals where client_id = ${target.clientId}
      `;
      expect(deals).toEqual([
        { title: '—', lostReason: null },
        { title: '—', lostReason: null },
      ]);
      const [contact] = await sql<{ name: string; email: string | null }[]>`
        select full_name as name, email from public.contacts where id = ${secondContact?.id ?? ''}
      `;
      expect(contact).toEqual({ name: '—', email: null });
      const [callRow] = await sql<{ notes: string | null }[]>`
        select notes from public.calls where id = ${call?.id ?? ''}
      `;
      expect(callRow?.notes).toBeNull();
      const [followUp] = await sql<{ message: string }[]>`
        select suggested_message as message from public.follow_ups where call_id = ${call?.id ?? ''}
      `;
      expect(followUp?.message).toBe('');
    });
  });

  it('keeps applications of clients with an open deal', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const target = await prospectApplication(sql, world, {
        path: 'c',
        dealCode: '0.2',
        createdAt: '2026-10-01T10:00:00Z',
      });

      await anonymizeExpiredApplications(NOW, { contexts: createDbContexts(testDatabase(sql)) });

      const [application] = await sql<{ anonymized: boolean }[]>`
        select anonymized_at is not null as anonymized from public.applications where id = ${target.applicationId}
      `;
      expect(application?.anonymized).toBe(false);
    });
  });

  it('keeps recent applications and paths a and b', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const recent = await prospectApplication(sql, world, {
        path: 'c',
        dealCode: 'X.4',
        createdAt: '2027-06-01T10:00:00Z',
      });
      const pathA = await prospectApplication(sql, world, {
        path: 'a',
        dealCode: 'X.4',
        createdAt: '2026-10-01T10:00:00Z',
      });

      await anonymizeExpiredApplications(NOW, { contexts: createDbContexts(testDatabase(sql)) });

      const rows = await sql<{ id: string }[]>`
        select id from public.applications
        where id in (${recent.applicationId}, ${pathA.applicationId}) and anonymized_at is null
      `;
      expect(rows).toHaveLength(2);
    });
  });
});
