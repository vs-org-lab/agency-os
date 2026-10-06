import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@agency-os/db';
import { isAuditAction, type AuditAction } from './actions';

export type AuditEntry = {
  organizationId: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  clientId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  actorKind?: 'user' | 'agent';
};

export async function recordAudit(tx: DbExecutor, entry: AuditEntry): Promise<string> {
  if (!isAuditAction(entry.action)) {
    throw new Error(`Unknown audit action: ${String(entry.action)}`);
  }

  const rows = await tx.execute<{ id: string }>(sql`
    select app.record_audit(
      ${entry.organizationId}::uuid,
      ${entry.action},
      ${entry.resourceType},
      ${entry.resourceId ?? null}::uuid,
      ${entry.clientId ?? null}::uuid,
      ${JSON.stringify(entry.metadata ?? {})}::jsonb,
      ${entry.ipAddress ?? null}::inet,
      ${entry.userAgent ?? null},
      ${entry.actorKind ?? 'user'}::app.actor_kind
    ) as id
  `);

  const id = rows[0]?.id;
  if (!id) throw new Error('Audit entry was not recorded');
  return id;
}
