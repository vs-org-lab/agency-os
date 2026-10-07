import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
  type World,
} from '@agency-os/db/testing';
import type { EmailPort, OutgoingEmail } from '@/modules/email';
import { createDbContexts } from '@/platform/db';
import type { NotificationDeps } from '../booking/notifications';
import { alertNewApplication, remindPendingQueueB } from './alerts';

afterAll(async () => {
  await closeTestSql();
});

function depsFor(sql: TransactionSql): NotificationDeps & { sent: OutgoingEmail[] } {
  const sent: OutgoingEmail[] = [];
  const email: EmailPort = {
    async send(message) {
      sent.push(message);
    },
  };
  return {
    sent,
    contexts: createDbContexts(testDatabase(sql)),
    email,
    appBaseUrl: 'https://os.example.com',
    linkSecret: 'a-secret-that-is-long-enough-for-hmac-signing',
    now: () => new Date('2026-10-12T08:00:00Z'),
  };
}

async function application(sql: TransactionSql, world: World, path: 'a' | 'b') {
  const [contact] = await sql<{ id: string }[]>`
    insert into public.contacts (organization_id, client_id, full_name, email, role)
    values (${world.organizationId}, ${world.clients.a}, 'Ana Costa', 'ana@empresa.pt', 'decision_maker')
    returning id
  `;
  const [deal] = await sql<{ id: string }[]>`
    insert into public.deals (organization_id, client_id, title, pipeline_code, source)
    values (${world.organizationId}, ${world.clients.a}, 'Client A', '0.2', 'application')
    returning id
  `;
  const [form] = await sql<{ id: string }[]>`
    insert into public.application_forms (organization_id, version, definition)
    values (${world.organizationId}, 7, '{}'::jsonb) returning id
  `;
  const [row] = await sql<{ id: string }[]>`
    insert into public.applications (organization_id, client_id, contact_id, deal_id, form_id, answers,
                                     score, path, consent_at, consent_text_version)
    values (${world.organizationId}, ${world.clients.a}, ${contact?.id ?? ''}, ${deal?.id ?? ''}, ${form?.id ?? ''},
            '{"texts":{"cost_of_inaction":"Perdemos dois contratos por ano."}}'::jsonb, 7, ${path}, now(), '2026-10')
    returning id
  `;
  return { applicationId: row?.id ?? '', dealId: deal?.id ?? '' };
}

describe('application alerts', () => {
  it('alerts founders with the score, path and cost of inaction', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { applicationId, dealId } = await application(sql, world, 'b');
      const deps = depsFor(sql);

      await alertNewApplication(applicationId, deps);

      expect(deps.sent).toHaveLength(1);
      expect(deps.sent[0]?.subject).toBe('Candidatura B: Client A');
      expect(deps.sent[0]?.text).toContain('Perdemos dois contratos por ano.');
      expect(deps.sent[0]?.text).toContain(`https://os.example.com/pipeline/${dealId}`);
    });
  });

  it('reminds about queue b only while the application is unreviewed', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { applicationId } = await application(sql, world, 'b');
      const deps = depsFor(sql);

      expect(await remindPendingQueueB(applicationId, deps)).toBe(true);
      await sql`
        update public.applications set review_decision = 'a', reviewed_at = now() where id = ${applicationId}
      `;
      expect(await remindPendingQueueB(applicationId, deps)).toBe(false);
      expect(deps.sent.map((message) => message.template)).toEqual(['founder.queue_b_pending']);
    });
  });
});
