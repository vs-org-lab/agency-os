import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createContractFixture,
  createFixtureWorld,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createProjectAsStaff, createProjectForDeal } from './projects';
import { listProcessTemplates, publishProcessTemplate } from './templates/service';
import { ORBIT_PROCESS } from './templates/defaults';
import { roomClaims, roomDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

describe('process templates', () => {
  it('only the founder publishes templates and invalid ones are refused', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = roomDeps(sql);
      const input = { name: 'Identidade de marca', definition: ORBIT_PROCESS, makeDefault: false };

      expect(await publishProcessTemplate(roomClaims(world.users.manager), input, deps)).toEqual({
        ok: false,
        rule: 'not_found',
      });
      expect(
        await publishProcessTemplate(
          roomClaims(world.users.founder),
          { ...input, definition: { phases: [] } },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      expect(await publishProcessTemplate(roomClaims(world.users.founder), input, deps)).toEqual({
        ok: true,
        key: 'identidade-de-marca',
        version: 1,
      });

      const templates = await deps.contexts.withUserContext(roomClaims(world.users.founder), (tx) =>
        listProcessTemplates(tx, world.organizationId),
      );
      expect(templates.map((template) => [template.key, template.isDefault])).toEqual([
        ['orbit', true],
        ['identidade-de-marca', false],
      ]);
    });
  });
});

describe('projects', () => {
  it('the 2.2 event creates one project with the default process', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contracts = await createContractFixture(sql, world);
      const { deps } = roomDeps(sql);

      await sql`update public.contracts set status = 'signed', signed_at = now() where id = ${contracts.a.contractId}`;

      const first = await createProjectForDeal(contracts.a.dealId, deps);
      const second = await createProjectForDeal(contracts.a.dealId, deps);

      expect(first.created).toBe(true);
      expect(second).toEqual({ created: false, projectId: first.projectId });
      const phases = await sql<{ name: string; status: string; code_on_start: string | null }[]>`
        select name, status::text, code_on_start::text from public.project_phases
        where project_id = ${first.projectId} order by position
      `;
      expect(phases).toHaveLength(6);
      expect(phases[0]).toEqual({
        name: 'Descoberta e arquitetura',
        status: 'pending',
        code_on_start: '2.3',
      });
      const steps =
        await sql`select id from public.project_steps where project_id = ${first.projectId}`;
      expect(steps).toHaveLength(13);
      const [project] = await sql<{ name: string; template_key: string }[]>`
        select name, template_key from public.projects where id = ${first.projectId}
      `;
      expect(project).toEqual({ name: 'Orbit essencial', template_key: 'orbit' });
      const updates = await sql<{ kind: string; visibility: string }[]>`
        select kind::text, visibility::text from public.project_updates
        where project_id = ${first.projectId}
      `;
      expect(updates).toEqual([{ kind: 'project_started', visibility: 'client' }]);
    });
  });

  it('the copy does not change when the template changes', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contracts = await createContractFixture(sql, world);
      const { deps } = roomDeps(sql);
      const created = await createProjectForDeal(contracts.a.dealId, deps);
      const [first] = ORBIT_PROCESS.phases;
      if (!first) throw new Error('Orbit has no phases');

      await publishProcessTemplate(
        roomClaims(world.users.founder),
        {
          key: 'orbit',
          name: 'Orbit',
          definition: { phases: [{ ...first, name: 'Descoberta' }] },
          makeDefault: true,
        },
        deps,
      );

      const phases = await sql`
        select id from public.project_phases where project_id = ${created.projectId}
      `;
      expect(phases).toHaveLength(6);
    });
  });

  it('manager creates a project for an assigned client only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = roomDeps(sql);
      const claims = roomClaims(world.users.manager);

      const created = await createProjectAsStaff(
        claims,
        { clientId: world.clients.a, name: 'Campanha de lançamento', templateKey: 'orbit' },
        deps,
      );
      expect(created.ok).toBe(true);
      expect(
        await createProjectAsStaff(
          claims,
          { clientId: world.clients.b, name: 'Outro', templateKey: 'orbit' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(
        await createProjectAsStaff(
          roomClaims(world.users.freelancer),
          { clientId: world.clients.a, name: 'Outro', templateKey: 'orbit' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('a deal keeps a single project even when created by hand', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contracts = await createContractFixture(sql, world);
      const { deps } = roomDeps(sql);
      await createProjectForDeal(contracts.a.dealId, deps);

      expect(
        await createProjectAsStaff(
          roomClaims(world.users.founder),
          {
            clientId: world.clients.a,
            dealId: contracts.a.dealId,
            name: 'Duplicado',
            templateKey: 'orbit',
          },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'deal_has_project' });
    });
  });
});
