'use server';

import type { OutcomeResult } from '@/components/outcomes/shared';
import {
  addOutcomeCondition,
  addOutcomeMeasurement,
  recordOutcomeCondition,
  storeOutcome,
} from '@/modules/outcomes/server';
import { getVerifiedClaims } from '@/platform/session';

type Claims = NonNullable<Awaited<ReturnType<typeof getVerifiedClaims>>>;

async function run(
  action: (claims: Claims) => Promise<{ ok: true } | { ok: false; rule: string }>,
): Promise<OutcomeResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await action(claims);
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

export async function saveOutcomeAction(input: {
  clientId: string;
  projectId: string;
  metric: string;
  unit: string;
  baseline: string;
  target: string;
  deadline: string;
  dataSource: string;
}): Promise<OutcomeResult> {
  return run((claims) => storeOutcome(claims, input));
}

export async function addConditionAction(input: {
  outcomeId: string;
  description: string;
}): Promise<OutcomeResult> {
  return run((claims) => addOutcomeCondition(claims, input));
}

export async function recordConditionAction(input: {
  conditionId: string;
  status: 'met' | 'failed' | 'pending';
  note?: string;
}): Promise<OutcomeResult> {
  return run((claims) => recordOutcomeCondition(claims, input));
}

export async function recordMeasurementAction(input: {
  outcomeId: string;
  measuredOn: string;
  value: string;
  note: string;
}): Promise<OutcomeResult> {
  return run((claims) => addOutcomeMeasurement(claims, input));
}
