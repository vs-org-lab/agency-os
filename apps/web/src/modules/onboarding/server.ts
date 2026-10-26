import 'server-only';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import { markPortalOnboardingSeen, portalOnboardingPending, type OnboardingViewer } from './portal';

const deps = () => ({ contexts: { withUserContext, withSystemContext } });

export const isPortalOnboardingPending = (claims: VerifiedClaims, viewer: OnboardingViewer) =>
  portalOnboardingPending(claims, viewer, deps());

export const recordPortalOnboardingSeen = (claims: VerifiedClaims, viewer: OnboardingViewer) =>
  markPortalOnboardingSeen(claims, viewer, deps());

export type { OnboardingViewer } from './portal';
