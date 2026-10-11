import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createDocumentFixture,
  createFixtureWorld,
  withTestTransaction,
} from '@agency-os/db/testing';
import {
  documentVersionUrl,
  loadPortalDocument,
  loadPortalDocuments,
  loadRoomDocuments,
  loadStaffDocument,
} from './readers';
import { documentClaims, documentsDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

describe('document readers', () => {
  it('the room lists project documents with Core and commercial cards', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);

      const room = await loadRoomDocuments(
        documentClaims(world.users.manager),
        { clientId: world.clients.a },
        deps,
      );
      expect(room?.projectId).toBe(documents.a.projectId);
      expect(room?.canWrite).toBe(true);
      expect(
        room?.documents.map((document) => [document.title, document.status, document.version]),
      ).toEqual([
        ['Apresentação', 'approved', 1],
        ['Briefing', 'draft', 1],
        ['Estratégia', 'with_client', 1],
      ]);
      expect(room?.commercial).toEqual({ proposal: null, contract: null, invoices: 'none' });
      expect(Array.isArray(room?.presentations)).toBe(true);
    });
  });

  it('commercial cards only for pipeline readers', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);
      await sql`
        insert into public.project_staff_assignments (organization_id, client_id, project_id, user_id)
        values (${world.organizationId}, ${world.clients.a}, ${documents.a.projectId},
                ${world.users.freelancer})
      `;

      const room = await loadRoomDocuments(
        documentClaims(world.users.freelancer),
        { clientId: world.clients.a },
        deps,
      );
      expect(room?.documents).toHaveLength(3);
      expect(room?.commercial).toBeNull();
      expect(room?.presentations).toEqual([]);
      const finance = await loadRoomDocuments(
        documentClaims(world.users.finance),
        { clientId: world.clients.a },
        deps,
      );
      expect(finance?.canWrite).toBe(false);
      expect(finance?.commercial).not.toBeNull();
    });
  });

  it('the staff document shows versions, internal comments and actions', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);

      const document = await loadStaffDocument(
        documentClaims(world.users.manager),
        documents.a.sharedId,
        deps,
      );
      expect(document).toMatchObject({
        id: documents.a.sharedId,
        title: 'Estratégia',
        kind: 'pdf',
        status: 'with_client',
        canWrite: true,
        pendingApprovalId: null,
        actions: { share: false, withdraw: true, remove: true, requestApproval: true },
      });
      expect(document?.current?.id).toBe(documents.a.sharedV1Id);
      expect(document?.versions.map((version) => [version.number, version.shared])).toEqual([
        [2, false],
        [1, true],
      ]);
      expect(
        document?.comments
          .map((comment) => [comment.body, comment.internal])
          .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
      ).toEqual([
        ['Falta a página 3', false],
        ['Rever antes de responder', true],
      ]);
      expect(
        await loadStaffDocument(documentClaims(world.users.freelancer), documents.a.sharedId, deps),
      ).toBeNull();
    });
  });

  it('clients read only versions shown to them', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);
      const decisionMaker = documentClaims(world.users.decisionMakerA, 'client');

      expect(
        (await loadPortalDocuments(decisionMaker, world.clients.a, deps)).map((d) => d.title),
      ).toEqual(['Apresentação', 'Estratégia']);
      const document = await loadPortalDocument(decisionMaker, documents.a.sharedId, deps);
      expect(document?.version?.id).toBe(documents.a.sharedV1Id);
      expect(document?.versions.map((version) => version.id)).toEqual([documents.a.sharedV1Id]);
      expect(document?.comments.map((comment) => comment.body)).toEqual(['Falta a página 3']);
      expect(document?.pendingApprovalId).toBeNull();
      expect(await loadPortalDocument(decisionMaker, documents.a.draftId, deps)).toBeNull();
      expect(await documentVersionUrl(decisionMaker, documents.a.sharedV2Id, deps)).toBeNull();
      expect(await documentVersionUrl(decisionMaker, documents.a.sharedV1Id, deps)).toBe(
        `memory://file/documents/fixture/${documents.a.sharedId}/1?ttl=900&download=estrategia-v1.pdf`,
      );
      expect(
        await documentVersionUrl(documentClaims(world.users.manager), documents.a.sharedV2Id, deps),
      ).not.toBeNull();
    });
  });

  it('client finance and other freelancers get nothing', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const documents = await createDocumentFixture(sql, world);
      const { deps } = documentsDeps(sql);

      for (const claims of [
        documentClaims(world.users.clientFinanceB, 'client'),
        documentClaims(world.users.freelancer),
      ]) {
        expect(await loadPortalDocument(claims, documents.a.sharedId, deps)).toBeNull();
        expect(await documentVersionUrl(claims, documents.a.sharedV1Id, deps)).toBeNull();
      }
      expect(
        await loadPortalDocuments(
          documentClaims(world.users.clientFinanceB, 'client'),
          world.clients.b,
          deps,
        ),
      ).toEqual([]);
    });
  });
});
