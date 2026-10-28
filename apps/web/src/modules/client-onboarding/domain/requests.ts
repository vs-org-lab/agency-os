import type { OnboardingRequest } from '@/modules/diagnosis';

export type OnboardingFacts = {
  /** Structured briefing answers by question id. */
  answers: ReadonlyMap<string, string>;
  /** Codes of the modules in the accepted proposal option. */
  modules: ReadonlySet<string>;
};

/** The template's requests that apply to this client, in template order. */
export function applicableRequests(
  requests: readonly OnboardingRequest[],
  facts: OnboardingFacts,
): OnboardingRequest[] {
  return requests.filter((request) => {
    switch (request.when.type) {
      case 'always':
        return true;
      case 'answer':
        return facts.answers.get(request.when.questionId) === request.when.equals;
      case 'module':
        return facts.modules.has(request.when.code);
    }
  });
}
