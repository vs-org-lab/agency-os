import type { DbTransaction } from '@agency-os/db';
import type { DbContexts } from '@/platform/db';

export type RoomsDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  /** Moves the deal to a pipeline code inside the transaction that changes the process. */
  moveDeal: (tx: DbTransaction, dealId: string, code: string) => Promise<void>;
  flush?: () => Promise<void>;
  now?: () => Date;
};
