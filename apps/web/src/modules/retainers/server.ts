import 'server-only';
import { sql } from 'drizzle-orm';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import type { RetainersDeps } from './access';
import { decideExtra, quoteExtra } from './extras';
import { loadPortalRetainer } from './portal';
import { loadStaffRetainer } from './readers';
import { requestWork } from './requests';
import { saveRetainer, type RetainerInput } from './retainers';
import { deleteUsage, recordUsage } from './usage';

const deps = (): RetainersDeps => ({ contexts: { withUserContext, withSystemContext } });

export const loadRoomRetainer = (claims: VerifiedClaims, clientId: string) =>
  loadStaffRetainer(claims, clientId, deps());
export const storeRetainer = (claims: VerifiedClaims, input: RetainerInput) =>
  saveRetainer(claims, input, deps());
export const addUsage = (
  claims: VerifiedClaims,
  input: { retainerId: string; kind: string; quantity: string; description: string },
) => recordUsage(claims, input, deps());
export const removeUsage = (claims: VerifiedClaims, usageId: string) =>
  deleteUsage(claims, usageId, deps());

export { RETAINER_FUNCTIONS } from './automations';

/** Whether the client has a retainer the caller may read, for the room menu (02). */
export async function hasRetainer(claims: VerifiedClaims, clientId: string): Promise<boolean> {
  const rows = await withUserContext(claims, (tx) =>
    tx.execute<{ id: string }>(
      sql`select id from public.retainers where client_id = ${clientId}::uuid limit 1`,
    ),
  );
  return rows.length > 0;
}

export const quoteExtraRequest = (
  claims: VerifiedClaims,
  input: { extraRequestId: string; amount: string; currency: string },
) => quoteExtra(claims, input, deps());
export const askForWork = (
  claims: VerifiedClaims,
  input: { retainerId: string; kind: string; description: string; quantity: string },
) => requestWork(claims, input, deps());
export const decideExtraRequest = (
  claims: VerifiedClaims,
  input: { extraRequestId: string; decision: 'approved' | 'declined' },
) => decideExtra(claims, input, deps());
export const loadClientRetainer = (claims: VerifiedClaims, clientId: string) =>
  loadPortalRetainer(claims, clientId, deps());
