'use server';

import { revalidatePath } from 'next/cache';
import type { KpiInput, KpiValuesInput, ResultsActionResult } from '@/modules/results';
import { removeKpi, storeKpi, storeKpiValues } from '@/modules/results/server';
import { getVerifiedClaims } from '@/platform/session';

function done(
  result: { ok: true; count?: number } | { ok: false; rule: string },
): ResultsActionResult {
  if (!result.ok) return { ok: false, code: result.rule };
  revalidatePath('/c', 'layout');
  revalidatePath('/portal', 'layout');
  return { ok: true, count: result.count };
}

export async function saveKpiAction(input: KpiInput): Promise<ResultsActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  return done(await storeKpi(claims, input));
}

export async function archiveKpiAction(kpiId: string): Promise<ResultsActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  return done(await removeKpi(claims, kpiId));
}

export async function recordKpiValuesAction(input: KpiValuesInput): Promise<ResultsActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  return done(await storeKpiValues(claims, input));
}
