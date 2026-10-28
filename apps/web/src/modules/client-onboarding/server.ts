import 'server-only';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import {
  loadClientOnboarding,
  onboardingUploadFolder,
  reopenOnboarding,
  respondToOnboarding,
} from './service';

const deps = () => ({ contexts: { withUserContext, withSystemContext } });

export const loadOnboarding = (claims: VerifiedClaims, clientId: string) =>
  loadClientOnboarding(claims, clientId, deps());

export const respondOnboarding = (
  claims: VerifiedClaims,
  input: { clientId: string; requestId: string; response: string },
) => respondToOnboarding(claims, input, deps());

export const reopenOnboardingRequest = (
  claims: VerifiedClaims,
  input: { clientId: string; requestId: string },
) => reopenOnboarding(claims, input, deps());

export const onboardingFolder = (
  claims: VerifiedClaims,
  input: { clientId: string; requestId: string },
) => onboardingUploadFolder(claims, input, deps());

export type { ClientOnboardingView, OnboardingItemView } from './service';
