import 'server-only';
import { sql } from 'drizzle-orm';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import type { OutcomesDeps } from './access';
import { addCondition, recordCondition } from './conditions';
import { recordMeasurement } from './measurements';
import { saveOutcome, type OutcomeInput } from './outcomes';
import { loadPortalOutcome } from './portal';
import { loadStaffOutcome } from './readers';

const deps = (): OutcomesDeps => ({ contexts: { withUserContext, withSystemContext } });

export const loadRoomOutcome = (claims: VerifiedClaims, clientId: string) =>
  loadStaffOutcome(claims, clientId, deps());
export const storeOutcome = (claims: VerifiedClaims, input: OutcomeInput) =>
  saveOutcome(claims, input, deps());
export const addOutcomeCondition = (
  claims: VerifiedClaims,
  input: { outcomeId: string; description: string },
) => addCondition(claims, input, deps());
export const recordOutcomeCondition = (
  claims: VerifiedClaims,
  input: { conditionId: string; status: 'met' | 'failed' | 'pending'; note?: string },
) => recordCondition(claims, input, deps());
export const addOutcomeMeasurement = (
  claims: VerifiedClaims,
  input: { outcomeId: string; measuredOn: string; value: string; note?: string },
) => recordMeasurement(claims, input, deps());
export const loadClientOutcome = (claims: VerifiedClaims, clientId: string) =>
  loadPortalOutcome(claims, clientId, deps());

/** Whether the client has an outcome the caller may read, for the room menu (02). */
export async function hasOutcome(claims: VerifiedClaims, clientId: string): Promise<boolean> {
  const rows = await withUserContext(claims, (tx) =>
    tx.execute<{ id: string }>(
      sql`select id from public.project_outcomes where client_id = ${clientId}::uuid limit 1`,
    ),
  );
  return rows.length > 0;
}
