import { describe, expect, it } from 'vitest';
import type { OnboardingRequest } from '@/modules/diagnosis';
import { applicableRequests } from './requests';

const request = (id: string, when: OnboardingRequest['when']): OnboardingRequest => ({
  id,
  kind: 'confirm',
  title: { 'pt-PT': id, en: id },
  body: { 'pt-PT': id, en: id },
  when,
});

const REQUESTS = [
  request('always', { type: 'always' }),
  request('brand', { type: 'answer', questionId: 'has_identity', equals: 'yes' }),
  request('no_brand', { type: 'answer', questionId: 'has_identity', equals: 'no' }),
  request('social', { type: 'module', code: 'B' }),
];

const ids = (answers: [string, string][], modules: string[]) =>
  applicableRequests(REQUESTS, { answers: new Map(answers), modules: new Set(modules) }).map(
    (entry) => entry.id,
  );

describe('applicable onboarding requests', () => {
  it('follows the answers and the contracted modules', () => {
    expect(ids([['has_identity', 'yes']], ['B'])).toEqual(['always', 'brand', 'social']);
    expect(ids([['has_identity', 'no']], [])).toEqual(['always', 'no_brand']);
  });

  it('an unanswered question asks nothing that depends on it', () => {
    expect(ids([], ['A'])).toEqual(['always']);
  });
});
