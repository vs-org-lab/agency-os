import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { AUDIT_ACTIONS, recordAudit } from '@/modules/audit';

afterAll(async () => {
  await closeTestSql();
});

describe('recordAudit', () => {
  it('writes an entry attributed to the authenticated user and returns its id', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await asUser(sql, world.users.founder);

      const id = await recordAudit(testDatabase(sql), {
        organizationId: world.organizationId,
        action: 'membership.changed',
        resourceType: 'organization_membership',
        resourceId: world.users.manager,
        metadata: { role: 'project_manager' },
        ipAddress: '198.51.100.4',
        userAgent: 'vitest',
      });

      const [row] = await sql<{ action: string; actor_user_id: string; metadata: unknown }[]>`
        select action, actor_user_id, metadata from public.audit_log where id = ${id}
      `;
      expect(row).toEqual({
        action: 'membership.changed',
        actor_user_id: world.users.founder,
        metadata: { role: 'project_manager' },
      });
    });
  });

  it('recordAudit rejects unknown action at type level and runtime', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);

      await expect(
        recordAudit(testDatabase(sql), {
          organizationId: world.organizationId,
          // @ts-expect-error unknown actions are rejected by the type system
          action: 'client.deleted',
          resourceType: 'client',
        }),
      ).rejects.toThrow(/Unknown audit action/);
    });
  });

  it('exposes the foundation actions', () => {
    expect([...AUDIT_ACTIONS]).toEqual(
      expect.arrayContaining([
        'auth.sign_in',
        'auth.sign_out',
        'auth.mfa_failed',
        'auth.mfa_enrolled',
        'invitation.created',
        'invitation.accepted',
        'membership.changed',
        'session.revoked',
        'password.changed',
      ]),
    );
  });
});
