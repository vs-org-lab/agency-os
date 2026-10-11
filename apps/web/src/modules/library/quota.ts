import { sql } from 'drizzle-orm';
import type { DbTransaction } from '@agency-os/db';
import { ORGANIZATION_STORAGE_LIMIT_BYTES } from './domain/limits';

/**
 * Bytes the organisation keeps or has reserved: ready library files, library uploads still
 * waiting (by their declared size) and ready proof versions.
 */
async function storageUsed(tx: DbTransaction, organizationId: string): Promise<number> {
  const rows = await tx.execute<{ used: string | null }>(sql`
    select (
      coalesce((select sum(size_bytes) from public.library_files
                where organization_id = ${organizationId}::uuid
                  and status in ('ready', 'uploading')), 0)
      + coalesce((select sum(size_bytes) from public.proof_versions
                  where organization_id = ${organizationId}::uuid and status = 'ready'), 0)
    )::text as used
  `);
  return Number(rows[0]?.used ?? 0);
}

/**
 * Whether `bytes` more fit under the organisation's storage ceiling (spec 2E.1, decision 5). The
 * check holds a transaction-scoped lock per organisation, so concurrent uploads are counted one
 * after another; the caller records its reservation in the same transaction.
 */
export async function fitsStorage(
  tx: DbTransaction,
  organizationId: string,
  bytes: number,
): Promise<boolean> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`storage:${organizationId}`}))`);
  return (await storageUsed(tx, organizationId)) + bytes <= ORGANIZATION_STORAGE_LIMIT_BYTES;
}
