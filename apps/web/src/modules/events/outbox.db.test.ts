import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { schema, type Database } from '@agency-os/db';
import {
  asUser,
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts } from '@/platform/db';
import { createOutboxDispatcher, DOMAIN_EVENTS, emit, type OutboxEvent } from '@/modules/events';

let client: postgres.Sql;
let db: Database;
const createdOrganizations: string[] = [];

beforeAll(() => {
  client = postgres(process.env.DATABASE_DIRECT_URL ?? '', { max: 4, prepare: false });
  db = drizzle({ client, schema });
});

afterEach(async () => {
  for (const organizationId of createdOrganizations.splice(0)) {
    await client`delete from public.domain_events where organization_id = ${organizationId}`;
    await client`delete from public.organizations where id = ${organizationId}`;
  }
});

afterAll(async () => {
  await client.end({ timeout: 5 });
  await closeTestSql();
});

async function committedOrganization(): Promise<string> {
  const [row] = await client<{ id: string }[]>`
    insert into public.organizations (name, slug) values ('Outbox', ${`outbox-${randomUUID()}`})
    returning id
  `;
  if (!row) throw new Error('Organization was not created');
  createdOrganizations.push(row.id);
  return row.id;
}

async function committedEvent(organizationId: string): Promise<string> {
  const { withSystemContext } = createDbContexts(db);
  return withSystemContext((tx) =>
    emit(tx, {
      type: 'identity.user.invited',
      organizationId,
      payload: { membershipId: randomUUID() },
    }),
  );
}

async function eventRow(id: string) {
  const [row] = await client<{ status: string; attempts: number; last_error: string | null }[]>`
    select status, attempts, last_error from public.domain_events where id = ${id}
  `;
  return row;
}

function dispatcherWith(send: (events: OutboxEvent[]) => Promise<void>, reportFailure = vi.fn()) {
  return {
    reportFailure,
    dispatch: createOutboxDispatcher({ contexts: createDbContexts(db), send, reportFailure }),
  };
}

describe('transactional outbox', () => {
  it('exposes the foundation event types', () => {
    expect(DOMAIN_EVENTS).toEqual(expect.arrayContaining(['identity.user.invited']));
  });

  it('event emitted in rolled back transaction is never dispatched', async () => {
    const organizationId = await committedOrganization();
    const { withSystemContext } = createDbContexts(db);
    let rolledBackId = '';

    await expect(
      withSystemContext(async (tx) => {
        rolledBackId = await emit(tx, {
          type: 'identity.user.invited',
          organizationId,
          payload: {},
        });
        throw new Error('business operation failed');
      }),
    ).rejects.toThrow('business operation failed');

    const sent: string[] = [];
    await dispatcherWith(async (events) => {
      sent.push(...events.map((event) => event.id));
    }).dispatch();

    expect(rolledBackId).not.toBe('');
    expect(sent).not.toContain(rolledBackId);
    expect(await eventRow(rolledBackId)).toBeUndefined();
  });

  it('send receives domain event id as idempotency id', async () => {
    const organizationId = await committedOrganization();
    const id = await committedEvent(organizationId);
    const sent: OutboxEvent[] = [];

    const result = await dispatcherWith(async (events) => {
      sent.push(...events);
    }).dispatch();

    const event = sent.find((candidate) => candidate.id === id);
    expect(event).toMatchObject({
      id,
      name: 'identity.user.invited',
      data: { organizationId, clientId: null },
    });
    expect(result.dispatched).toBeGreaterThanOrEqual(1);
    expect(await eventRow(id)).toMatchObject({ status: 'dispatched', attempts: 1 });
  });

  it('committed event is dispatched once across two concurrent dispatchers', async () => {
    const organizationId = await committedOrganization();
    const ids = await Promise.all(Array.from({ length: 6 }, () => committedEvent(organizationId)));
    const sent: string[] = [];
    const slowSend = async (events: OutboxEvent[]) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      sent.push(...events.map((event) => event.id));
    };

    await Promise.all([dispatcherWith(slowSend).dispatch(), dispatcherWith(slowSend).dispatch()]);

    const ours = sent.filter((id) => ids.includes(id));
    expect(ours.sort()).toEqual([...ids].sort());
    expect(new Set(ours).size).toBe(ours.length);
  });

  it('failed send increments attempts and stores last_error', async () => {
    const organizationId = await committedOrganization();
    const id = await committedEvent(organizationId);

    await dispatcherWith(async () => {
      throw new Error('inngest unavailable');
    }).dispatch();

    expect(await eventRow(id)).toEqual({
      status: 'pending',
      attempts: 1,
      last_error: 'inngest unavailable',
    });
  });

  it('event becomes failed after 10 attempts and reports the failure', async () => {
    const organizationId = await committedOrganization();
    const id = await committedEvent(organizationId);
    await client`update public.domain_events set attempts = 9 where id = ${id}`;
    const reportFailure = vi.fn();

    await dispatcherWith(async () => {
      throw new Error('inngest unavailable');
    }, reportFailure).dispatch();

    expect(await eventRow(id)).toMatchObject({ status: 'failed', attempts: 10 });
    expect(reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id, attempts: 10, error: 'inngest unavailable' }),
    );
  });

  it('authenticated members emit events through app.emit_event but outsiders cannot', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const database = testDatabase(sql);
      await sql`savepoint before_user`;
      await asUser(sql, world.users.founder);

      const id = await emit(database, {
        type: 'identity.user.invited',
        organizationId: world.organizationId,
        payload: {},
      });
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      await sql`rollback to savepoint before_user`;

      const outsider = randomUUID();
      await sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: outsider, role: 'authenticated', aal: 'aal2' })}, true)`;
      await sql`set local role authenticated`;
      await expect(
        emit(database, {
          type: 'identity.user.invited',
          organizationId: world.organizationId,
          payload: {},
        }),
      ).rejects.toSatisfy((error: Error & { cause?: Error }) =>
        /not a member of the organization/.test(error.cause?.message ?? error.message),
      );
    });
  });

  it('emit rejects unknown event types', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);

      await expect(
        emit(testDatabase(sql), {
          // @ts-expect-error unknown event types are rejected by the type system
          type: 'client.deleted',
          organizationId: world.organizationId,
          payload: {},
        }),
      ).rejects.toThrow(/Unknown domain event/);
    });
  });
});
