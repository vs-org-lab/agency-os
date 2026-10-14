import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createMoneyFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { FAKE_PROPOSAL } from '@/platform/receipt-reader';
import { deleteExpense, linkExpense, saveExpense } from './expenses';
import { readReceipt, receiptPath, startReceiptUpload } from './receipts';
import { moneyClaims, moneyDeps, PDF_RECEIPT, PNG_RECEIPT } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

const EXPENSE = {
  spentOn: '2026-10-02',
  vendor: 'Gráfica Porto',
  description: 'Cartões de visita',
  category: 'other',
  amount: '48.90',
  currency: 'EUR',
} as const;

async function expenseRow(sql: TransactionSql, id: string) {
  await sql`reset role`;
  const [row] = await sql<
    {
      vendor: string;
      amount: string;
      receipt_path: string | null;
      receipt_name: string | null;
      receipt_mime_type: string | null;
      client_id: string | null;
      payment_request_id: string | null;
    }[]
  >`
    select vendor, amount::text, receipt_path, receipt_name, receipt_mime_type, client_id,
           payment_request_id
    from public.expenses where id = ${id}
  `;
  return row;
}

async function auditActions(sql: TransactionSql, resourceId: string): Promise<string[]> {
  await sql`reset role`;
  const rows = await sql<{ action: string }[]>`
    select action from public.audit_log where resource_id = ${resourceId}
    order by occurred_at, id
  `;
  return rows.map((row) => row.action).sort();
}

describe('money expenses', () => {
  it(
    'writers upload receipts and the type is checked',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const { deps, storage, reads } = moneyDeps(sql);
        const finance = moneyClaims(world.users.finance);

        const started = await startReceiptUpload(
          finance,
          { fileName: 'recibo.png', sizeBytes: PNG_RECEIPT.length },
          deps,
        );
        if (!started.ok) throw new Error('upload not started');
        expect(started.uploadUrl).toContain(`money/${world.organizationId}/receipts/`);
        storage.files.set(receiptPath(world.organizationId, started.receiptId), PNG_RECEIPT);
        expect(await readReceipt(finance, started.receiptId, deps)).toEqual({
          ok: true,
          mimeType: 'image/png',
          proposal: FAKE_PROPOSAL,
        });

        const pdf = await startReceiptUpload(
          finance,
          { fileName: 'fatura.pdf', sizeBytes: PDF_RECEIPT.length },
          deps,
        );
        if (!pdf.ok) throw new Error('upload not started');
        storage.files.set(receiptPath(world.organizationId, pdf.receiptId), PDF_RECEIPT);
        expect(await readReceipt(finance, pdf.receiptId, deps)).toEqual({
          ok: true,
          mimeType: 'application/pdf',
          proposal: null,
        });
        expect(reads).toEqual(['image/png']);

        const text = await startReceiptUpload(
          finance,
          { fileName: 'falso.png', sizeBytes: 20 },
          deps,
        );
        if (!text.ok) throw new Error('upload not started');
        const textPath = receiptPath(world.organizationId, text.receiptId);
        storage.files.set(textPath, new TextEncoder().encode('isto não é uma imagem'));
        expect(await readReceipt(finance, text.receiptId, deps)).toEqual({
          ok: false,
          rule: 'invalid_file',
        });
        expect(storage.files.has(textPath)).toBe(false);

        expect(
          await startReceiptUpload(
            finance,
            { fileName: 'grande.png', sizeBytes: 10_485_761 },
            deps,
          ),
        ).toEqual({ ok: false, rule: 'invalid_input' });
      });
    },
    SLOW,
  );

  it(
    'receipts outside the organisation are refused',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const { deps, storage } = moneyDeps(sql);
        const founder = moneyClaims(world.users.founder);
        const foreign = 'b5f0a2c4-0000-4000-8000-000000000001';
        storage.files.set(
          `money/00000000-0000-4000-8000-000000000099/receipts/${foreign}`,
          PNG_RECEIPT,
        );

        expect(
          await saveExpense(
            founder,
            { ...EXPENSE, receiptId: foreign, receiptName: 'recibo.png' },
            deps,
          ),
        ).toEqual({ ok: false, rule: 'invalid_file' });
        expect(
          await saveExpense(
            founder,
            { ...EXPENSE, receiptId: '../../outra/recibo', receiptName: 'recibo.png' },
            deps,
          ),
        ).toEqual({ ok: false, rule: 'invalid_input' });
      });
    },
    SLOW,
  );

  it(
    'expenses are validated and audited',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const { deps, storage } = moneyDeps(sql);
        const founder = moneyClaims(world.users.founder);

        for (const invalid of [
          { ...EXPENSE, amount: '0' },
          { ...EXPENSE, amount: '12.345' },
          { ...EXPENSE, vendor: '' },
          { ...EXPENSE, spentOn: '2026-02-30' },
          { ...EXPENSE, currency: 'XYZ' },
          { ...EXPENSE, category: 'luxury' },
          { ...EXPENSE, clientId: '00000000-0000-4000-8000-000000000099' },
        ]) {
          expect(await saveExpense(founder, invalid, deps), JSON.stringify(invalid)).toEqual({
            ok: false,
            rule: 'invalid_input',
          });
        }

        const upload = await startReceiptUpload(
          founder,
          { fileName: 'recibo.png', sizeBytes: PNG_RECEIPT.length },
          deps,
        );
        if (!upload.ok) throw new Error('upload not started');
        storage.files.set(receiptPath(world.organizationId, upload.receiptId), PNG_RECEIPT);
        const saved = await saveExpense(
          founder,
          {
            ...EXPENSE,
            clientId: world.clients.a,
            receiptId: upload.receiptId,
            receiptName: 'recibo.png',
          },
          deps,
        );
        if (!saved.ok) throw new Error('expense not saved');
        expect(await expenseRow(sql, saved.id)).toMatchObject({
          vendor: 'Gráfica Porto',
          amount: '48.90',
          receipt_path: receiptPath(world.organizationId, upload.receiptId),
          receipt_name: 'recibo.png',
          receipt_mime_type: 'image/png',
          client_id: world.clients.a,
        });

        expect(
          await saveExpense(founder, { ...EXPENSE, id: saved.id, amount: '50.00' }, deps),
        ).toEqual({ ok: true, id: saved.id });
        expect(await expenseRow(sql, saved.id)).toMatchObject({
          amount: '50.00',
          receipt_name: 'recibo.png',
          client_id: null,
        });
        expect(await deleteExpense(founder, saved.id, deps)).toEqual({ ok: true });
        expect(await expenseRow(sql, saved.id)).toBeUndefined();
        expect(storage.files.has(receiptPath(world.organizationId, upload.receiptId))).toBe(false);
        expect(await auditActions(sql, saved.id)).toEqual([
          'money.expense_created',
          'money.expense_deleted',
          'money.expense_updated',
        ]);
      });
    },
    SLOW,
  );

  it(
    'managers read but cannot write',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const { deps } = moneyDeps(sql);
        for (const [userId, kind] of [
          [world.users.manager, 'internal'],
          [world.users.freelancer, 'internal'],
          [world.users.decisionMakerA, 'client'],
        ] as const) {
          const claims = moneyClaims(userId, kind);
          expect(await saveExpense(claims, EXPENSE, deps)).toEqual({
            ok: false,
            rule: 'not_found',
          });
          expect(
            await startReceiptUpload(claims, { fileName: 'r.png', sizeBytes: 10 }, deps),
          ).toEqual({ ok: false, rule: 'not_found' });
        }
      });
    },
    SLOW,
  );

  it(
    "expenses link only to their client's live requests",
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const money = await createMoneyFixture(sql, world);
        const { deps } = moneyDeps(sql);
        const finance = moneyClaims(world.users.finance);
        const expenseId = money.a.expenseId;

        for (const paymentRequestId of [
          money.billing.b.sentRequestId,
          money.billing.a.voidRequestId,
        ]) {
          expect(await linkExpense(finance, { expenseId, paymentRequestId }, deps)).toEqual({
            ok: false,
            rule: 'invalid_input',
          });
        }
        expect(
          await linkExpense(
            finance,
            {
              expenseId: money.internalExpenseId,
              paymentRequestId: money.billing.a.paidRequestId,
            },
            deps,
          ),
        ).toEqual({ ok: false, rule: 'invalid_input' });
        expect(
          await linkExpense(
            finance,
            { expenseId, paymentRequestId: money.billing.a.paidRequestId },
            deps,
          ),
        ).toEqual({ ok: true });
        expect((await expenseRow(sql, expenseId))?.payment_request_id).toBe(
          money.billing.a.paidRequestId,
        );
        expect(await linkExpense(finance, { expenseId, paymentRequestId: null }, deps)).toEqual({
          ok: true,
        });
        expect((await expenseRow(sql, expenseId))?.payment_request_id).toBeNull();
        expect(await auditActions(sql, expenseId)).toEqual([
          'money.expense_linked',
          'money.expense_unlinked',
        ]);
      });
    },
    SLOW,
  );

  it(
    'a linked expense cannot be deleted or change client',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const money = await createMoneyFixture(sql, world);
        const { deps } = moneyDeps(sql);
        const founder = moneyClaims(world.users.founder);

        expect(await deleteExpense(founder, money.a.expenseId, deps)).toEqual({
          ok: false,
          rule: 'invalid_state',
        });
        expect(
          await saveExpense(
            founder,
            { ...EXPENSE, id: money.a.expenseId, clientId: world.clients.b },
            deps,
          ),
        ).toEqual({ ok: false, rule: 'invalid_state' });
        expect(
          await saveExpense(
            founder,
            { ...EXPENSE, id: money.a.expenseId, clientId: world.clients.a, amount: '99.00' },
            deps,
          ),
        ).toEqual({ ok: true, id: money.a.expenseId });
      });
    },
    SLOW,
  );
});
