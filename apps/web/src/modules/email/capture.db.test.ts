import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts } from '@/platform/db';
import { createCaptureEmailPort } from './capture';

afterAll(async () => {
  await closeTestSql();
});

describe('createCaptureEmailPort', () => {
  it('stores the rendered message', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const port = createCaptureEmailPort(createDbContexts(testDatabase(sql)));

      await port.send({
        to: 'ana@empresa.pt',
        template: 'lead.booking_link',
        subject: 'A sua chamada',
        html: '<html>link</html>',
        text: 'link',
        fromName: 'Vladimir, Aurion',
        organizationId: world.organizationId,
      });

      await sql`reset role`;
      const rows = await sql<{ recipient: string; template: string; text: string }[]>`
        select recipient, template, text from public.captured_emails
        where organization_id = ${world.organizationId}
      `;
      expect(rows).toEqual([
        { recipient: 'ana@empresa.pt', template: 'lead.booking_link', text: 'link' },
      ]);
    });
  });
});
