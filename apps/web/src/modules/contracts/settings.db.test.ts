import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { archiveLegalEntity, listLegalEntities, saveLegalEntity } from './entities';
import { DEFAULT_CONTRACT_TEMPLATES } from './templates/defaults';
import { activeContractTemplate, publishContractTemplate } from './templates/service';

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

function depsFor(sql: TransactionSql) {
  return { contexts: createDbContexts(testDatabase(sql)) };
}

const ENTITY = {
  legalName: 'Aurion Creative Lda',
  taxId: '516000000',
  address: 'Av. da Liberdade, Lisboa',
  country: 'PT' as const,
  email: 'geral@aurion.test',
  representativeName: 'Vladimir Silva',
  representativeRole: 'Gerente',
  isDefault: false,
};

describe('legal entities', () => {
  it('only the founder saves entities', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);

      expect(await saveLegalEntity(claimsFor(world.users.manager), ENTITY, depsFor(sql))).toEqual({
        ok: false,
        rule: 'not_found',
      });
      expect(
        await saveLegalEntity(
          claimsFor(world.users.founder),
          { ...ENTITY, taxId: '' },
          depsFor(sql),
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('keeps one default entity', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const claims = claimsFor(world.users.founder);

      const first = await saveLegalEntity(claims, ENTITY, deps);
      const second = await saveLegalEntity(
        claims,
        { ...ENTITY, legalName: 'Aurion Angola Lda', country: 'AO', isDefault: true },
        deps,
      );
      if (!first.ok || !second.ok) throw new Error('Entities were not saved');
      const entities = await deps.contexts.withUserContext(claims, (tx) => listLegalEntities(tx));

      expect(entities.map((entity) => [entity.id, entity.isDefault])).toEqual([
        [second.entityId, true],
        [first.entityId, false],
      ]);
    });
  });

  it('saves bank details and normalises the iban', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const claims = claimsFor(world.users.founder);

      const saved = await saveLegalEntity(
        claims,
        {
          ...ENTITY,
          bankName: 'Banco Exemplo',
          iban: 'pt50 0002 0123 1234 5678 9015 4',
          bic: 'bexaptpl',
          paymentInstructions: 'Multicaixa Express: 923 000 000\nIndicar o número do pedido.',
        },
        deps,
      );
      if (!saved.ok) throw new Error('Entity was not saved');
      const [entity] = await deps.contexts.withUserContext(claims, (tx) => listLegalEntities(tx));

      expect(entity).toMatchObject({
        bankName: 'Banco Exemplo',
        iban: 'PT50000201231234567890154',
        bic: 'BEXAPTPL',
        paymentInstructions: 'Multicaixa Express: 923 000 000\nIndicar o número do pedido.',
      });
    });
  });

  it('rejects a malformed iban and keeps bank details optional', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const claims = claimsFor(world.users.founder);

      expect(await saveLegalEntity(claims, { ...ENTITY, iban: 'PT50 12' }, deps)).toEqual({
        ok: false,
        rule: 'invalid_input',
      });
      const saved = await saveLegalEntity(claims, ENTITY, deps);
      if (!saved.ok) throw new Error('Entity was not saved');
      const [entity] = await deps.contexts.withUserContext(claims, (tx) => listLegalEntities(tx));
      expect(entity).toMatchObject({ bankName: '', iban: '', bic: '', paymentInstructions: '' });
    });
  });

  it('makes the first entity the default and hides archived ones', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const claims = claimsFor(world.users.founder);

      const first = await saveLegalEntity(claims, ENTITY, deps);
      if (!first.ok) throw new Error('Entity was not saved');
      const listed = await deps.contexts.withUserContext(claims, (tx) => listLegalEntities(tx));
      expect(listed[0]?.isDefault).toBe(true);

      expect(await archiveLegalEntity(claims, { entityId: first.entityId }, deps)).toEqual({
        ok: true,
      });
      expect(await deps.contexts.withUserContext(claims, (tx) => listLegalEntities(tx))).toEqual(
        [],
      );
    });
  });
});

describe('contract templates', () => {
  it('creates the default template on first use', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);

      const template = await deps.contexts.withUserContext(claimsFor(world.users.founder), (tx) =>
        activeContractTemplate(tx, world.organizationId, 'en'),
      );

      expect(template).toMatchObject({ version: 1, body: DEFAULT_CONTRACT_TEMPLATES.en });
    });
  });

  it('publishing creates a new active version', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = depsFor(sql);
      const claims = claimsFor(world.users.founder);

      const result = await publishContractTemplate(
        claims,
        { locale: 'pt-PT', body: 'Contrato com {{cliente.denominacao}}' },
        deps,
      );
      const active = await deps.contexts.withUserContext(claims, (tx) =>
        activeContractTemplate(tx, world.organizationId, 'pt-PT'),
      );

      expect(result).toEqual({ ok: true, version: 2 });
      expect(active).toMatchObject({ version: 2, body: 'Contrato com {{cliente.denominacao}}' });
    });
  });

  it('publishing an invalid template is refused', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);

      expect(
        await publishContractTemplate(
          claimsFor(world.users.founder),
          { locale: 'pt-PT', body: 'Olá {{cliente.telefone}}' },
          depsFor(sql),
        ),
      ).toEqual({ ok: false, rule: 'invalid_template', unknown: ['cliente.telefone'] });
      expect(
        await publishContractTemplate(
          claimsFor(world.users.manager),
          { locale: 'pt-PT', body: 'Olá' },
          depsFor(sql),
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });
});
