'use client';

import {
  OnboardingPlan,
  useOnboardingAnswers,
} from '@/components/client-onboarding/onboarding-plan';
import type { CoreOnboarding } from '@/modules/diagnosis';
import { saveAnswerAction } from './actions';

/** The Core tab's view of the onboarding the briefing generates, with its answers. */
export function OnboardingSection({
  engagementId,
  onboarding,
}: {
  engagementId: string;
  onboarding: CoreOnboarding;
}) {
  const state = useOnboardingAnswers(onboarding.answers, (blockId, questionId, answer) =>
    saveAnswerAction(engagementId, blockId, questionId, answer),
  );
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <OnboardingPlan onboarding={onboarding} state={state} />
    </div>
  );
}
