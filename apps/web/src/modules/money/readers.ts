import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { LIBRARY_LINK_TTL_SECONDS } from '@/modules/library';
import type { VerifiedClaims } from '@/platform/db';
import { moneyActor, today, type MoneyDeps } from './access';
import type { ExpenseCategory } from './domain/categories';
import { renewalState, type RenewalState, type SubscriptionCycle } from './domain/cycles';
import { lisbonYear, summarise, type Currency, type YearSummary } from './domain/summary';

export type MoneyRequestRow = {
  id: string;
  clientName: string;
  number: string;
  label: string;
  amount: string;
  currency: Currency;
  status: 'sent' | 'paid' | 'void';
  sentAt: string;
  legalInvoiceNumber: string | null;
};

export type MoneyExpenseRow = {
  id: string;
  spentOn: string;
  vendor: string;
  description: string;
  category: ExpenseCategory;
  amount: string;
  currency: Currency;
  clientId: string | null;
  clientName: string | null;
  paymentRequestId: string | null;
  paymentRequestNumber: string | null;
  hasReceipt: boolean;
};

export type MoneySubscriptionRow = {
  id: string;
  name: string;
  vendor: string;
  category: ExpenseCategory;
  amount: string;
  currency: Currency;
  cycle: SubscriptionCycle;
  nextRenewalOn: string;
  status: 'active' | 'cancelled';
  /** Null for cancelled subscriptions. */
  renewal: RenewalState | null;
};

export type MoneyClientOption = {
  id: string;
  name: string;
  requests: { id: string; number: string }[];
};

/** S-09: one year of money for whoever reads billing. */
export type MoneyYearView = {
  canWrite: boolean;
  year: number;
  years: number[];
  summary: YearSummary;
  requests: MoneyRequestRow[];
  expenses: MoneyExpenseRow[];
  subscriptions: MoneySubscriptionRow[];
  clients: MoneyClientOption[];
};

const LISBON_YEAR_OF = (column: ReturnType<typeof sql.raw>) =>
  sql`extract(year from ${column} at time zone 'Europe/Lisbon')::int`;

export async function loadMoneyYear(
  claims: VerifiedClaims,
  year: number,
  deps: MoneyDeps,
): Promise<MoneyYearView | null> {
  const actor = await moneyActor(claims, 'read', deps);
  if (!actor || !Number.isInteger(year) || year < 2000 || year > 2100) return null;
  const writer = await moneyActor(claims, 'write', deps);
  const organizationId = actor.organizationId;
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  return deps.contexts.withSystemContext(async (tx) => {
    const received = await tx.execute<{ amount: string; currency: Currency }>(sql`
      select amount::text, currency from public.payments
      where organization_id = ${organizationId}::uuid
        and received_on between ${from}::date and ${to}::date
    `);
    const requests = await tx.execute<{
      id: string;
      client_name: string;
      number: string;
      label: string;
      amount: string;
      currency: Currency;
      status: 'sent' | 'paid' | 'void';
      sent_at: string | Date;
      legal_invoice_number: string | null;
    }>(sql`
      select r.id, c.name as client_name, r.number, r.label, r.amount::text, r.currency::text,
             r.status::text, r.sent_at, li.number as legal_invoice_number
      from public.payment_requests r
      join public.clients c on c.id = r.client_id
      left join public.legal_invoices li on li.request_id = r.id
      where r.organization_id = ${organizationId}::uuid
        and ${LISBON_YEAR_OF(sql.raw('r.sent_at'))} = ${year}
      order by r.sent_at desc, r.number desc
    `);
    const expenses = await tx.execute<{
      id: string;
      spent_on: string;
      vendor: string;
      description: string;
      category: ExpenseCategory;
      amount: string;
      currency: Currency;
      client_id: string | null;
      client_name: string | null;
      payment_request_id: string | null;
      payment_request_number: string | null;
      has_receipt: boolean;
    }>(sql`
      select e.id, e.spent_on::text, e.vendor, e.description, e.category::text, e.amount::text,
             e.currency::text, e.client_id, c.name as client_name, e.payment_request_id,
             r.number as payment_request_number, e.receipt_path is not null as has_receipt
      from public.expenses e
      left join public.clients c on c.id = e.client_id
      left join public.payment_requests r on r.id = e.payment_request_id
      where e.organization_id = ${organizationId}::uuid
        and e.spent_on between ${from}::date and ${to}::date
      order by e.spent_on desc, e.created_at desc
    `);
    const subscriptions = await tx.execute<{
      id: string;
      name: string;
      vendor: string;
      category: ExpenseCategory;
      amount: string;
      currency: Currency;
      cycle: SubscriptionCycle;
      next_renewal_on: string;
      status: 'active' | 'cancelled';
    }>(sql`
      select id, name, vendor, category::text, amount::text, currency::text, cycle::text,
             next_renewal_on::text, status::text
      from public.subscriptions
      where organization_id = ${organizationId}::uuid
      order by status = 'cancelled', next_renewal_on, name
    `);
    const [first] = await tx.execute<{ year: number | null }>(sql`
      select min(y)::int as year from (
        select extract(year from received_on)::int as y from public.payments
        where organization_id = ${organizationId}::uuid
        union all
        select ${LISBON_YEAR_OF(sql.raw('sent_at'))} from public.payment_requests
        where organization_id = ${organizationId}::uuid
        union all
        select extract(year from spent_on)::int from public.expenses
        where organization_id = ${organizationId}::uuid
      ) years
    `);
    const clientRows = await tx.execute<{
      id: string;
      name: string;
      request_id: string | null;
      request_number: string | null;
    }>(sql`
      select c.id, c.name, r.id as request_id, r.number as request_number
      from public.clients c
      left join public.payment_requests r on r.client_id = c.id and r.status <> 'void'
      where c.organization_id = ${organizationId}::uuid
      order by c.name, r.number desc
    `);

    const current = lisbonYear((deps.now ?? (() => new Date()))());
    const oldest = Math.min(first?.year ?? current, current, year);
    const latest = Math.max(current, year);
    const years = Array.from({ length: latest - oldest + 1 }, (_, index) => oldest + index);
    const day = today(deps);

    const clients = new Map<string, MoneyClientOption>();
    for (const row of clientRows) {
      const client = clients.get(row.id) ?? { id: row.id, name: row.name, requests: [] };
      if (row.request_id && row.request_number) {
        client.requests.push({ id: row.request_id, number: row.request_number });
      }
      clients.set(row.id, client);
    }

    return {
      canWrite: writer !== null,
      year,
      years,
      summary: summarise({
        received: [...received],
        open: requests
          .filter((request) => request.status === 'sent')
          .map((request) => ({ amount: request.amount, currency: request.currency })),
        spent: expenses.map((expense) => ({ amount: expense.amount, currency: expense.currency })),
      }),
      requests: requests.map((row) => ({
        id: row.id,
        clientName: row.client_name,
        number: row.number,
        label: row.label,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        sentAt: new Date(row.sent_at).toISOString(),
        legalInvoiceNumber: row.legal_invoice_number,
      })),
      expenses: expenses.map((row) => ({
        id: row.id,
        spentOn: row.spent_on,
        vendor: row.vendor,
        description: row.description,
        category: row.category,
        amount: row.amount,
        currency: row.currency,
        clientId: row.client_id,
        clientName: row.client_name,
        paymentRequestId: row.payment_request_id,
        paymentRequestNumber: row.payment_request_number,
        hasReceipt: row.has_receipt,
      })),
      subscriptions: subscriptions.map((row) => ({
        id: row.id,
        name: row.name,
        vendor: row.vendor,
        category: row.category,
        amount: row.amount,
        currency: row.currency,
        cycle: row.cycle,
        nextRenewalOn: row.next_renewal_on,
        status: row.status,
        renewal: row.status === 'active' ? renewalState(row.next_renewal_on, day) : null,
      })),
      clients: [...clients.values()],
    };
  });
}

/** A link of 15 minutes to an expense's receipt, for whoever reads billing. */
export async function expenseReceiptUrl(
  claims: VerifiedClaims,
  expenseId: string,
  deps: MoneyDeps,
): Promise<string | null> {
  const actor = await moneyActor(claims, 'read', deps);
  if (!actor || !z.uuid().safeParse(expenseId).success) return null;
  const [row] = await deps.contexts.withSystemContext((tx) =>
    tx.execute<{ receipt_path: string | null; receipt_name: string | null }>(sql`
      select receipt_path, receipt_name from public.expenses
      where id = ${expenseId}::uuid and organization_id = ${actor.organizationId}::uuid
    `),
  );
  if (!row?.receipt_path) return null;
  return deps.storage.signedDownloadUrl(
    row.receipt_path,
    LIBRARY_LINK_TTL_SECONDS,
    row.receipt_name ?? 'recibo',
  );
}

/**
 * The receipt link for whoever may see it: billing readers, or the client's decision maker and
 * finance contact through the portal view when the expense is linked to one of their requests.
 */
export async function receiptUrlFor(
  claims: VerifiedClaims,
  expenseId: string,
  deps: MoneyDeps,
): Promise<string | null> {
  if (!z.uuid().safeParse(expenseId).success) return null;
  if (claims.user_kind !== 'client') return expenseReceiptUrl(claims, expenseId, deps);
  const [allowed] = await deps.contexts.withUserContext(claims, (tx) =>
    tx.execute<{ expense_id: string }>(sql`
      select expense_id from public.portal_payment_request_receipts
      where expense_id = ${expenseId}::uuid
    `),
  );
  if (!allowed) return null;
  const [row] = await deps.contexts.withSystemContext((tx) =>
    tx.execute<{ receipt_path: string | null; receipt_name: string | null }>(sql`
      select receipt_path, receipt_name from public.expenses where id = ${expenseId}::uuid
    `),
  );
  if (!row?.receipt_path) return null;
  return deps.storage.signedDownloadUrl(
    row.receipt_path,
    LIBRARY_LINK_TTL_SECONDS,
    row.receipt_name ?? 'recibo',
  );
}
