import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asSystem,
  asUser,
  closeTestSql,
  createCommercialFixture,
  createFixtureWorld,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

async function visibleDealIds(sql: TransactionSql): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id from public.deals`.catch((error: Error) => {
    if (/permission denied/.test(error.message)) return [];
    throw error;
  });
  return rows.map((row) => row.id).sort();
}

async function renameDeal(sql: TransactionSql, dealId: string): Promise<number> {
  const result = await sql`update public.deals set title = 'Renamed' where id = ${dealId}`.catch(
    (error: Error) => {
      if (/permission denied/.test(error.message)) return { count: 0 };
      throw error;
    },
  );
  return result.count;
}

describe('commercial access', () => {
  it('founder reads and writes deals of every client', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      await asUser(sql, world.users.founder);

      expect(await visibleDealIds(sql)).toEqual([fixture.a.dealId, fixture.b.dealId].sort());
      expect(await renameDeal(sql, fixture.b.dealId)).toBe(1);
    });
  });

  it('manager reads and writes only deals of assigned clients', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      await asUser(sql, world.users.manager);

      expect(await visibleDealIds(sql)).toEqual([fixture.a.dealId]);
      expect(await renameDeal(sql, fixture.a.dealId)).toBe(1);
      expect(await renameDeal(sql, fixture.b.dealId)).toBe(0);
    });
  });

  it('finance reads deals but cannot update them', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      await asUser(sql, world.users.finance);

      expect(await visibleDealIds(sql)).toEqual([fixture.a.dealId, fixture.b.dealId].sort());
      expect(await renameDeal(sql, fixture.a.dealId)).toBe(0);
    });
  });

  it('freelancer and client users see no commercial rows', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createCommercialFixture(sql, world);

      for (const userId of [
        world.users.freelancer,
        world.users.decisionMakerA,
        world.users.operationalA,
      ]) {
        await sql`savepoint probe`;
        await asUser(sql, userId);
        for (const table of [
          'deals',
          'contacts',
          'calls',
          'follow_ups',
          'applications',
          'timeline_entries',
          'deal_stage_changes',
          'acquisition_targets',
          'message_templates',
          'application_forms',
          'commercial_settings',
        ]) {
          const rows = await sql`select id from ${sql('public.' + table)}`.catch(() => []);
          expect(rows, `${userId} ${table}`).toHaveLength(0);
        }
        await sql`rollback to savepoint probe`;
        await asSystem(sql);
      }
    });
  });

  it('founder without mfa sees no deals', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createCommercialFixture(sql, world);
      await asUser(sql, world.users.founder, { aal: 'aal1' });

      expect(await visibleDealIds(sql)).toEqual([]);
    });
  });

  it('stage change is recorded with reason and actor', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      await asUser(sql, world.users.founder);

      await sql`select set_config('app.stage_change_reason', 'Lost to a competitor', true)`;
      await sql`reset role`;
      await sql`update public.deals set pipeline_code = 'X.4' where id = ${fixture.a.dealId}`;

      const history = await sql<
        { from_code: string | null; to_code: string; reason: string | null; actor: string | null }[]
      >`
        select from_code::text, to_code::text, reason, actor_user_id as actor
        from public.deal_stage_changes where deal_id = ${fixture.a.dealId}
        order by created_at, to_code
      `;
      expect(history).toEqual([
        { from_code: null, to_code: '0.3', reason: null, actor: null },
        {
          from_code: '0.3',
          to_code: 'X.4',
          reason: 'Lost to a competitor',
          actor: world.users.founder,
        },
      ]);
    });
  });

  it('deal_stage_changes and timeline_entries reject update and delete', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createCommercialFixture(sql, world);

      for (const statement of [
        sql`update public.deal_stage_changes set reason = 'x'`,
        sql`delete from public.deal_stage_changes`,
        sql`update public.timeline_entries set item_type = 'x'`,
        sql`delete from public.timeline_entries`,
      ]) {
        await sql`savepoint probe`;
        await expect(statement).rejects.toThrow(/append-only/);
        await sql`rollback to savepoint probe`;
      }
    });
  });

  it('only one open deal per client', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createCommercialFixture(sql, world);

      await expect(
        sql`
          insert into public.deals (organization_id, client_id, title, source)
          values (${world.organizationId}, ${world.clients.a}, 'Second', 'application')
        `,
      ).rejects.toThrow(/deals_open_per_client_key/);
    });
  });

  it('calendar connection is visible only to its owner', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await sql`
        insert into public.calendar_connections (organization_id, user_id, account_email)
        values (${world.organizationId}, ${world.users.founder}, 'founder@example.com')
      `;

      await sql`savepoint probe`;
      await asUser(sql, world.users.manager);
      expect(await sql`select id from public.calendar_connections`).toHaveLength(0);
      await sql`rollback to savepoint probe`;
      await asSystem(sql);

      await asUser(sql, world.users.founder);
      expect(await sql`select id from public.calendar_connections`).toHaveLength(1);
      const updated = await sql`
        update public.calendar_connections set account_email = 'other@example.com'
      `.catch(() => ({ count: 0 }));
      expect(updated.count).toBe(0);
    });
  });

  it('seen markers are readable and writable only by their owner', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);

      await asUser(sql, world.users.founder);
      await sql`
        insert into public.seen_markers (organization_id, user_id, area, seen_at)
        values (${world.organizationId}, ${world.users.founder}, 'applications', now())
      `;
      expect(await sql`select id from public.seen_markers`).toHaveLength(1);
      await asSystem(sql);

      await asUser(sql, world.users.manager);
      expect(await sql`select id from public.seen_markers`).toHaveLength(0);
      const updated = await sql`
        update public.seen_markers set seen_at = now() where user_id = ${world.users.founder}
      `;
      expect(updated.count).toBe(0);
      await sql`savepoint probe`;
      await expect(
        sql`
          insert into public.seen_markers (organization_id, user_id, area, seen_at)
          values (${world.organizationId}, ${world.users.founder}, 'applications', now())
        `,
      ).rejects.toThrow(/row-level security/);
      await sql`rollback to savepoint probe`;
    });
  });

  it('throttle and captured emails are invisible to every user', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await sql`
        insert into public.submission_throttle (organization_id, kind, key_hash, window_start)
        values (${world.organizationId}, 'application_ip', 'hash', now())
      `;
      await sql`
        insert into public.captured_emails (organization_id, recipient, template, subject, html, text)
        values (${world.organizationId}, 'lead@example.com', 'lead.booking_link', 's', 'h', 't')
      `;
      await asUser(sql, world.users.founder);

      for (const table of ['submission_throttle', 'captured_emails']) {
        const rows = await sql`select id from ${sql('public.' + table)}`.catch(() => []);
        expect(rows, table).toHaveLength(0);
      }
    });
  });

  it('founder manages commercial settings, forms, templates and acquisition targets', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await asUser(sql, world.users.founder);

      await sql`insert into public.commercial_settings (organization_id) values (${world.organizationId})`;
      await sql`
        insert into public.message_templates (organization_id, kind, locale, name, body)
        values (${world.organizationId}, 'follow_up', 'pt-PT', 'Day 3', 'Body')
      `;
      await sql`
        insert into public.acquisition_targets (organization_id, company_name, sector)
        values (${world.organizationId}, 'Target', 'energy')
      `;
      await sql`
        insert into public.application_forms (organization_id, version, definition)
        values (${world.organizationId}, 2, '{}'::jsonb)
      `;
    });
  });

  it('finance reads acquisition targets but cannot change them', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await sql`
        insert into public.acquisition_targets (organization_id, company_name, sector)
        values (${world.organizationId}, 'Target', 'energy')
      `;
      await asUser(sql, world.users.finance);

      expect(await sql`select id from public.acquisition_targets`).toHaveLength(1);
      const updated = await sql`
        update public.acquisition_targets set notes = 'x'
      `.catch(() => ({ count: 0 }));
      expect(updated.count).toBe(0);
    });
  });
  it('pipeline writers change a deal stage only through the service', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);

      for (const user of [world.users.manager, world.users.founder]) {
        await asUser(sql, user);
        await expect(
          sql.savepoint(
            (tx) =>
              tx`update public.deals set pipeline_code = '2.2' where id = ${fixture.a.dealId}`,
          ),
        ).rejects.toThrow(/permission denied/);
        await expect(
          sql.savepoint(
            (tx) => tx`
              insert into public.deals (organization_id, client_id, title, pipeline_code)
              values (${world.organizationId}, ${world.clients.a}, 'Atalho', '2.10')
            `,
          ),
        ).rejects.toThrow(/row-level security/);
      }
    });
  });
});
