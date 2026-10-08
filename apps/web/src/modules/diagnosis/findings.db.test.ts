import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createCoreFixture,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { createMemoryEvidenceStorage, type MemoryEvidenceStorage } from './evidence/memory';
import { MAX_EVIDENCE_BYTES } from './evidence/validate';
import { evidenceUrl, removeFinding, saveFinding, type FindingInput } from './findings';

afterAll(async () => {
  await closeTestSql();
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function claimsFor(userId: string): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
  };
}

function depsFor(sql: TransactionSql, storage: MemoryEvidenceStorage) {
  return { contexts: createDbContexts(testDatabase(sql)), storage };
}

function finding(engagementId: string, overrides: Partial<FindingInput> = {}): FindingInput {
  return {
    engagementId,
    front: 'orbit',
    title: 'Formulário falha no telemóvel',
    description: 'O botão de envio fica fora do ecrã.',
    evidence: { kind: 'file', bytes: PNG },
    impact: 'high',
    effort: 'low',
    owner: 'internal',
    bringToCall: false,
    ...overrides,
  };
}

describe('findings', () => {
  it('rejects a file whose content is not an allowed type', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const storage = createMemoryEvidenceStorage();

      const result = await saveFinding(
        claimsFor(world.users.founder),
        finding(core.a.engagementId, {
          evidence: { kind: 'file', bytes: new TextEncoder().encode('<svg></svg>') },
        }),
        depsFor(sql, storage),
      );

      expect(result).toEqual({ ok: false, rule: 'file_type' });
      expect(storage.files.size).toBe(0);
    });
  });

  it('rejects files above 10 MB', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const large = new Uint8Array(MAX_EVIDENCE_BYTES + 1);
      large.set(PNG);

      const result = await saveFinding(
        claimsFor(world.users.founder),
        finding(core.a.engagementId, { evidence: { kind: 'file', bytes: large } }),
        depsFor(sql, createMemoryEvidenceStorage()),
      );

      expect(result).toEqual({ ok: false, rule: 'file_too_large' });
    });
  });

  it('stores an image and returns a signed url only to allowed users', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const storage = createMemoryEvidenceStorage();
      const deps = depsFor(sql, storage);

      const saved = await saveFinding(
        claimsFor(world.users.founder),
        finding(core.b.engagementId),
        deps,
      );
      if (!saved.ok) throw new Error(`save failed: ${saved.rule}`);

      const [path] = [...storage.files.keys()];
      expect(path).toMatch(
        new RegExp(
          `^${world.organizationId}/${world.clients.b}/${core.b.engagementId}/[0-9a-f-]+\\.png$`,
        ),
      );
      expect(
        await evidenceUrl(claimsFor(world.users.founder), { findingId: saved.findingId }, deps),
      ).toBe(`memory://${path}?ttl=300`);
      expect(
        await evidenceUrl(claimsFor(world.users.manager), { findingId: saved.findingId }, deps),
      ).toBeNull();
    });
  });

  it('proposes the lane from impact and effort', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);

      const saved = await saveFinding(
        claimsFor(world.users.founder),
        finding(core.a.engagementId, { impact: 'high', effort: 'medium' }),
        depsFor(sql, createMemoryEvidenceStorage()),
      );
      if (!saved.ok) throw new Error(`save failed: ${saved.rule}`);

      await sql`reset role`;
      const [row] = await sql<{ lane: string }[]>`
        select lane::text from public.core_findings where id = ${saved.findingId}
      `;
      expect(row?.lane).toBe('days_90');
    });
  });

  it('refuses a fourth finding to bring to the call', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const deps = depsFor(sql, createMemoryEvidenceStorage());
      const founder = claimsFor(world.users.founder);
      const linked = (title: string) =>
        finding(core.a.engagementId, {
          title,
          bringToCall: true,
          evidence: { kind: 'link', value: 'https://example.com/evidence' },
        });

      for (const title of ['Um', 'Dois', 'Três']) {
        expect(await saveFinding(founder, linked(title), deps)).toMatchObject({ ok: true });
      }
      expect(await saveFinding(founder, linked('Quatro'), deps)).toEqual({
        ok: false,
        rule: 'call_limit',
      });
    });
  });

  it('rejects non https links', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);

      for (const value of ['http://example.com/report', 'javascript:alert(1)', 'not a link']) {
        expect(
          await saveFinding(
            claimsFor(world.users.founder),
            finding(core.a.engagementId, { evidence: { kind: 'link', value } }),
            depsFor(sql, createMemoryEvidenceStorage()),
          ),
        ).toEqual({ ok: false, rule: 'invalid_input' });
      }
    });
  });

  it('removing a finding removes its file', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const storage = createMemoryEvidenceStorage();
      const deps = depsFor(sql, storage);
      const saved = await saveFinding(
        claimsFor(world.users.founder),
        finding(core.a.engagementId),
        deps,
      );
      if (!saved.ok) throw new Error(`save failed: ${saved.rule}`);

      const removed = await removeFinding(
        claimsFor(world.users.founder),
        { findingId: saved.findingId },
        deps,
      );

      expect(removed).toEqual({ ok: true });
      expect(storage.files.size).toBe(0);
    });
  });
});
