import { withActor, type Actor } from '@/modules/access';
import { canReadBilling, canWriteBilling } from '@/modules/billing';
import type { LibraryStorage } from '@/modules/library';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import type { ReceiptReader } from '@/platform/receipt-reader';

export type MoneyDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  storage: LibraryStorage;
  /** Reads receipts as a proposal; absent when not configured. */
  reader?: ReceiptReader;
  now?: () => Date;
};

export type NotFound = { ok: false; rule: 'not_found' };
export const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };
export const INVALID_INPUT = { ok: false, rule: 'invalid_input' } as const;
export const INVALID_FILE = { ok: false, rule: 'invalid_file' } as const;
export const INVALID_STATE = { ok: false, rule: 'invalid_state' } as const;
export const OK = { ok: true } as const;

/** The money of the access matrix: founder, finance and managers read; founder and finance write. */
export function moneyActor(
  claims: VerifiedClaims,
  need: 'read' | 'write',
  deps: MoneyDeps,
): Promise<Actor | null> {
  return withActor(
    deps.contexts,
    claims,
    async (_tx, actor) =>
      (need === 'read' ? canReadBilling(actor) : canWriteBilling(actor)) ? actor : null,
    null,
  );
}

export const today = (deps: MoneyDeps) =>
  (deps.now ?? (() => new Date()))().toISOString().slice(0, 10);
