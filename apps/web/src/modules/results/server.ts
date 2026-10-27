import 'server-only';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import type { ResultsDeps } from './access';
import { archiveKpi, saveKpi, type KpiInput } from './kpis';
import { loadClientResults, loadPortalResults } from './readers';
import { recordKpiValues, type KpiValuesInput } from './values';

const deps = (): ResultsDeps => ({ contexts: { withUserContext, withSystemContext } });

export const loadRoomResults = (claims: VerifiedClaims, clientId: string) =>
  loadClientResults(claims, clientId, deps());
export const loadClientPortalResults = (claims: VerifiedClaims, clientId: string) =>
  loadPortalResults(claims, clientId, deps());
export const storeKpi = (claims: VerifiedClaims, input: KpiInput) => saveKpi(claims, input, deps());
export const removeKpi = (claims: VerifiedClaims, kpiId: string) =>
  archiveKpi(claims, { kpiId }, deps());
export const storeKpiValues = (claims: VerifiedClaims, input: KpiValuesInput) =>
  recordKpiValues(claims, input, deps());
