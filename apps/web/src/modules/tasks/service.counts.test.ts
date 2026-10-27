import { describe, expect, it, vi } from 'vitest';
import type { DbTransaction } from '@agency-os/db';
import { countTasksByStatus } from './service';

function fakeTx(rows: { status: string; count: string }[]) {
  const execute = vi.fn(async () => rows);
  return { tx: { execute } as unknown as DbTransaction, execute };
}

describe('countTasksByStatus', () => {
  it('splits the rows into open, done and all', async () => {
    const { tx } = fakeTx([
      { status: 'open', count: '3' },
      { status: 'done', count: '2' },
    ]);

    expect(await countTasksByStatus(tx, {})).toEqual({ open: 3, done: 2, all: 5 });
  });

  it('is zero for a status with no rows', async () => {
    const { tx } = fakeTx([{ status: 'done', count: '4' }]);

    expect(await countTasksByStatus(tx, { clientId: 'c' })).toEqual({ open: 0, done: 4, all: 4 });
  });

  it('runs one query in the caller transaction', async () => {
    const { tx, execute } = fakeTx([]);

    await countTasksByStatus(tx, {});

    expect(execute).toHaveBeenCalledTimes(1);
  });
});
