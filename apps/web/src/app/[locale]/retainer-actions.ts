'use server';

import type { RetainerFormInput } from '@/components/retainers/retainer-form';
import type { RetainerResult } from '@/components/retainers/shared';
import {
  addUsage,
  askForWork,
  decideExtraRequest,
  quoteExtraRequest,
  removeUsage,
  storeRetainer,
} from '@/modules/retainers/server';
import { getVerifiedClaims } from '@/platform/session';

type Claims = NonNullable<Awaited<ReturnType<typeof getVerifiedClaims>>>;

async function run(
  action: (claims: Claims) => Promise<{ ok: true } | { ok: false; rule: string }>,
): Promise<RetainerResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await action(claims);
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

export async function saveRetainerAction(input: RetainerFormInput): Promise<RetainerResult> {
  return run((claims) => storeRetainer(claims, input));
}

export async function recordUsageAction(input: {
  retainerId: string;
  kind: string;
  quantity: string;
  description: string;
}): Promise<RetainerResult> {
  return run((claims) => addUsage(claims, input));
}

export async function deleteUsageAction(usageId: string): Promise<RetainerResult> {
  return run((claims) => removeUsage(claims, usageId));
}

export async function quoteExtraAction(
  extraRequestId: string,
  amount: string,
  currency: string,
): Promise<RetainerResult> {
  return run((claims) => quoteExtraRequest(claims, { extraRequestId, amount, currency }));
}

export async function requestWorkAction(input: {
  retainerId: string;
  kind: string;
  description: string;
  quantity: string;
}): Promise<{ ok: true; outcome: 'task' | 'extra' } | { ok: false; code: string }> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await askForWork(claims, input);
  return result.ok ? result : { ok: false, code: result.rule };
}

export async function decideExtraAction(
  extraRequestId: string,
  decision: 'approved' | 'declined',
): Promise<RetainerResult> {
  return run((claims) => decideExtraRequest(claims, { extraRequestId, decision }));
}
