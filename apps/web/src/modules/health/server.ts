import 'server-only';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import type { HealthDeps } from './access';
import { loadClientHealth } from './health';

const deps = (): HealthDeps => ({ contexts: { withUserContext, withSystemContext } });

export const loadRoomHealth = (claims: VerifiedClaims, clientId: string) =>
  loadClientHealth(claims, clientId, deps());
