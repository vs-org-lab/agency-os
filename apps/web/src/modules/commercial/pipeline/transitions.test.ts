import { describe, expect, it } from 'vitest';
import { PIPELINE_CODES, type PipelineCode } from './codes';
import type { CoreReadiness } from '@/modules/diagnosis';
import { evaluateTransition, type TransitionInput } from './transitions';

const READY: CoreReadiness = {
  briefingHasContent: true,
  frontsScored: true,
  findingsWithoutEvidence: 0,
  internalItems: 2,
  crossReviewed: true,
  presentationAttached: true,
  proposalSessionScheduled: true,
  presentationShared: true,
};

const OFF_CYCLE: PipelineCode[] = ['X.1', 'X.2', 'X.3', 'X.4'];

const ALLOWED_FOR_FOUNDER: Record<PipelineCode, PipelineCode[]> = {
  '0.1': ['0.2', ...OFF_CYCLE],
  '0.2': ['0.3', '0.1', ...OFF_CYCLE],
  '0.3': ['0.4', '0.2', ...OFF_CYCLE],
  '0.4': ['0.3', '1.1', '2.1', ...OFF_CYCLE],
  '1.1': ['1.2', ...OFF_CYCLE],
  '1.2': ['1.3', '1.1', ...OFF_CYCLE],
  '1.3': ['1.4', '1.2', ...OFF_CYCLE],
  '1.4': ['1.5', '1.3', ...OFF_CYCLE],
  '1.5': ['1.6', '1.4', ...OFF_CYCLE],
  '1.6': ['1.5', '2.1', ...OFF_CYCLE],
  '2.1': ['2.2', ...OFF_CYCLE],
  '2.2': ['2.1', ...OFF_CYCLE],
  '2.3': ['2.2', ...OFF_CYCLE],
  '2.4': OFF_CYCLE,
  '2.5': OFF_CYCLE,
  '2.6': OFF_CYCLE,
  '2.7': OFF_CYCLE,
  '2.8': OFF_CYCLE,
  '2.9': OFF_CYCLE,
  '2.10': OFF_CYCLE,
  '3.1': OFF_CYCLE,
  '3.2': OFF_CYCLE,
  '3.3': OFF_CYCLE,
  '3.4': OFF_CYCLE,
  '3.5': OFF_CYCLE,
  '3.6': OFF_CYCLE,
  '4.1': OFF_CYCLE,
  '4.2': OFF_CYCLE,
  '4.3': OFF_CYCLE,
  '4.4': OFF_CYCLE,
  'X.1': ['0.2', 'X.2', 'X.3', 'X.4'],
  'X.2': ['0.2', 'X.1', 'X.3', 'X.4'],
  'X.3': [],
  'X.4': [],
};

function input(
  overrides: Partial<TransitionInput> & Pick<TransitionInput, 'from' | 'to'>,
): TransitionInput {
  return {
    previousOpenCode: '0.2',
    actor: 'founder',
    reason: 'Reason',
    facts: {
      hasScheduledCall: true,
      hasCompletedCallWithOutcome: true,
      coreReadiness: READY,
      contractSigned: true,
      coreDeliveredWithinYear: true,
      firstPaymentReceived: true,
    },
    ...overrides,
  };
}

describe('evaluateTransition', () => {
  for (const from of PIPELINE_CODES) {
    it(`founder moves from ${from} only to the allowed codes`, () => {
      for (const to of PIPELINE_CODES) {
        const decision = evaluateTransition(input({ from, to }));
        expect(decision.allowed, `${from} -> ${to}`).toBe(ALLOWED_FOR_FOUNDER[from].includes(to));
      }
    });
  }

  it('qualifies 0.1 to 0.2', () => {
    expect(
      evaluateTransition(input({ from: '0.1', to: '0.2', actor: 'staff', reason: null })),
    ).toEqual({ allowed: true });
  });

  it('requires a scheduled call for 0.3', () => {
    expect(
      evaluateTransition(
        input({
          from: '0.2',
          to: '0.3',
          facts: {
            hasScheduledCall: false,
            hasCompletedCallWithOutcome: false,
            coreReadiness: null,
            contractSigned: false,
            coreDeliveredWithinYear: false,
            firstPaymentReceived: false,
          },
        }),
      ),
    ).toEqual({ allowed: false, rule: 'call_required' });
  });

  it('requires a recorded outcome for 0.4', () => {
    expect(
      evaluateTransition(
        input({
          from: '0.3',
          to: '0.4',
          facts: {
            hasScheduledCall: true,
            hasCompletedCallWithOutcome: false,
            coreReadiness: null,
            contractSigned: false,
            coreDeliveredWithinYear: false,
            firstPaymentReceived: false,
          },
        }),
      ),
    ).toEqual({ allowed: false, rule: 'call_outcome_required' });
  });

  it('0.4 to 1.1 is allowed', () => {
    expect(
      evaluateTransition(
        input({
          from: '0.4',
          to: '1.1',
          actor: 'system',
          reason: null,
          facts: {
            hasScheduledCall: false,
            hasCompletedCallWithOutcome: true,
            coreReadiness: null,
            contractSigned: false,
            coreDeliveredWithinYear: false,
            firstPaymentReceived: false,
          },
        }),
      ),
    ).toEqual({ allowed: true });
  });

  it('advancing inside stage one checks the criteria', () => {
    expect(
      evaluateTransition(
        input({
          from: '1.3',
          to: '1.4',
          facts: {
            hasScheduledCall: false,
            hasCompletedCallWithOutcome: true,
            coreReadiness: { ...READY, crossReviewed: false, internalItems: 1 },
            contractSigned: false,
            coreDeliveredWithinYear: false,
            firstPaymentReceived: false,
          },
        }),
      ),
    ).toEqual({
      allowed: false,
      rule: 'core_criteria',
      gaps: ['internal_items_below_minimum', 'cross_review_missing'],
    });
    expect(
      evaluateTransition(
        input({
          from: '1.2',
          to: '1.3',
          facts: {
            hasScheduledCall: false,
            hasCompletedCallWithOutcome: true,
            coreReadiness: null,
            contractSigned: false,
            coreDeliveredWithinYear: false,
            firstPaymentReceived: false,
          },
        }),
      ),
    ).toMatchObject({ allowed: false, rule: 'core_criteria' });
  });

  it('reopening a paused Core returns to its code without checking criteria', () => {
    expect(
      evaluateTransition(
        input({
          from: 'X.1',
          to: '1.4',
          previousOpenCode: '1.4',
          facts: {
            hasScheduledCall: false,
            hasCompletedCallWithOutcome: true,
            coreReadiness: null,
            contractSigned: false,
            coreDeliveredWithinYear: false,
            firstPaymentReceived: false,
          },
        }),
      ),
    ).toEqual({ allowed: true });
    expect(
      evaluateTransition(
        input({
          from: '1.4',
          to: '1.3',
          facts: {
            hasScheduledCall: false,
            hasCompletedCallWithOutcome: true,
            coreReadiness: null,
            contractSigned: false,
            coreDeliveredWithinYear: false,
            firstPaymentReceived: false,
          },
        }),
      ),
    ).toEqual({ allowed: true });
  });

  it('2.1 needs a signed contract', () => {
    const facts = { ...input({ from: '1.6', to: '2.1' }).facts, contractSigned: false };

    expect(evaluateTransition(input({ from: '1.6', to: '2.1', facts }))).toEqual({
      allowed: false,
      rule: 'contract_required',
    });
    expect(evaluateTransition(input({ from: '1.6', to: '2.1' }))).toEqual({ allowed: true });
  });

  it('0.4 to 2.1 needs a Core delivered in the last 12 months', () => {
    const facts = { ...input({ from: '0.4', to: '2.1' }).facts, coreDeliveredWithinYear: false };

    expect(evaluateTransition(input({ from: '0.4', to: '2.1', facts }))).toEqual({
      allowed: false,
      rule: 'core_required',
    });
  });

  it('2.1 to 2.2 needs the first payment', () => {
    const facts = { ...input({ from: '2.1', to: '2.2' }).facts, firstPaymentReceived: false };

    expect(evaluateTransition(input({ from: '2.1', to: '2.2', facts }))).toEqual({
      allowed: false,
      rule: 'payment_required',
    });
    expect(evaluateTransition(input({ from: '2.1', to: '2.2' }))).toEqual({ allowed: true });
    expect(
      evaluateTransition(input({ from: '2.1', to: '2.2', actor: 'system', reason: null })),
    ).toEqual({ allowed: true });
  });

  it('2.3 waits for rooms', () => {
    expect(evaluateTransition(input({ from: '2.2', to: '2.3' }))).toEqual({
      allowed: false,
      rule: 'module_pending',
      module: 'rooms',
    });
  });

  it('refuses impossible jumps as not allowed rather than pending', () => {
    expect(evaluateTransition(input({ from: '0.1', to: '2.5' }))).toEqual({
      allowed: false,
      rule: 'not_allowed',
    });
    expect(evaluateTransition(input({ from: '0.2', to: '0.4' }))).toEqual({
      allowed: false,
      rule: 'not_allowed',
    });
  });

  it('X.4 requires a reason', () => {
    expect(evaluateTransition(input({ from: '0.3', to: 'X.4', reason: '  ' }))).toEqual({
      allowed: false,
      rule: 'reason_required',
    });
    expect(evaluateTransition(input({ from: '0.3', to: 'X.1', reason: null }))).toEqual({
      allowed: true,
    });
  });

  it('reopens X.1 to the previous open code only', () => {
    expect(evaluateTransition(input({ from: 'X.1', to: '0.3', previousOpenCode: '0.3' }))).toEqual({
      allowed: true,
    });
    expect(evaluateTransition(input({ from: 'X.1', to: '0.2', previousOpenCode: '0.3' }))).toEqual({
      allowed: false,
      rule: 'not_allowed',
    });
  });

  it('X.3 and X.4 are final', () => {
    expect(evaluateTransition(input({ from: 'X.4', to: '0.1' }))).toEqual({
      allowed: false,
      rule: 'final_state',
    });
    expect(evaluateTransition(input({ from: 'X.3', to: 'X.1' }))).toEqual({
      allowed: false,
      rule: 'final_state',
    });
  });

  it('refuses moving to the same code', () => {
    expect(evaluateTransition(input({ from: '0.2', to: '0.2' }))).toEqual({
      allowed: false,
      rule: 'same_code',
    });
  });

  it('staff cannot step back', () => {
    expect(evaluateTransition(input({ from: '0.3', to: '0.2', actor: 'staff' }))).toEqual({
      allowed: false,
      rule: 'founder_only',
    });
  });

  it('founder steps back with reason', () => {
    expect(evaluateTransition(input({ from: '0.3', to: '0.2', reason: null }))).toEqual({
      allowed: false,
      rule: 'reason_required',
    });
    expect(evaluateTransition(input({ from: '0.3', to: '0.2' }))).toEqual({ allowed: true });
  });

  it('system acts with founder rights', () => {
    expect(evaluateTransition(input({ from: '0.3', to: '0.2', actor: 'system' }))).toEqual({
      allowed: true,
    });
  });
});
