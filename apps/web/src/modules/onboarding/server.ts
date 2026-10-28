import 'server-only';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import {
  markPortalOnboardingSeen,
  portalOnboardingPending,
  type OnboardingViewer,
  type PortalSeenArea,
} from './portal';

const deps = () => ({ contexts: { withUserContext, withSystemContext } });

export const isPortalOnboardingPending = (
  claims: VerifiedClaims,
  viewer: OnboardingViewer,
  area?: PortalSeenArea,
) => portalOnboardingPending(claims, viewer, deps(), area);

export const recordPortalOnboardingSeen = (
  claims: VerifiedClaims,
  viewer: OnboardingViewer,
  area?: PortalSeenArea,
) => markPortalOnboardingSeen(claims, viewer, deps(), area);

export type { OnboardingViewer, PortalSeenArea } from './portal';
