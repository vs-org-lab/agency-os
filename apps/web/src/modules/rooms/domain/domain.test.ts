import { describe, expect, it } from 'vitest';
import { ORBIT_PROCESS } from '../templates/defaults';
import { canCompletePhase, canStartPhase, type PhaseState } from './phases';
import { planWeeks } from './plan';
import { nextChainedStep, type StepState } from './steps';
import { validateProcessDefinition } from './template';

const phase = (position: number, overrides: Partial<PhaseState> = {}): PhaseState => ({
  id: `phase-${position}`,
  position,
  status: 'pending',
  requiresApproval: false,
  ...overrides,
});

const step = (position: number, overrides: Partial<StepState> = {}): StepState => ({
  id: `step-${position}`,
  phaseId: 'phase-1',
  position,
  status: 'todo',
  chained: false,
  ...overrides,
});

describe('validateProcessDefinition', () => {
  it('orbit default is valid', () => {
    expect(validateProcessDefinition(ORBIT_PROCESS)).toEqual({
      ok: true,
      definition: ORBIT_PROCESS,
    });
    expect(ORBIT_PROCESS.phases.map((entry) => [entry.codeOnStart, entry.codeOnDone])).toEqual([
      ['2.3', '2.4'],
      ['2.5', null],
      ['2.6', null],
      ['2.7', null],
      ['2.8', null],
      ['2.9', null],
    ]);
    expect(ORBIT_PROCESS.phases.map((entry) => entry.requiresApproval)).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
    ]);
  });

  it('rejects codes outside orbit', () => {
    const definition = {
      phases: [{ ...ORBIT_PROCESS.phases[0], codeOnStart: '1.4' }],
    };
    expect(validateProcessDefinition(definition).ok).toBe(false);
  });

  it('first step cannot be chained', () => {
    const [first] = ORBIT_PROCESS.phases;
    if (!first) throw new Error('Orbit has no phases');
    const definition = {
      phases: [{ ...first, steps: [{ name: 'Passo', visibleToClient: true, chained: true }] }],
    };
    expect(validateProcessDefinition(definition)).toMatchObject({ ok: false });
  });

  it('rejects empty processes, empty phases and blank names', () => {
    expect(validateProcessDefinition({ phases: [] }).ok).toBe(false);
    expect(
      validateProcessDefinition({
        phases: [
          { name: 'Fase', requiresApproval: false, codeOnStart: null, codeOnDone: null, steps: [] },
        ],
      }).ok,
    ).toBe(false);
    expect(
      validateProcessDefinition({
        phases: [
          {
            name: '  ',
            requiresApproval: false,
            codeOnStart: null,
            codeOnDone: null,
            steps: [{ name: 'Passo', visibleToClient: false, chained: false }],
          },
        ],
      }).ok,
    ).toBe(false);
  });
});

describe('phases', () => {
  it('next phase waits for the previous one', () => {
    const phases = [phase(1, { status: 'in_progress' }), phase(2)];
    expect(canStartPhase(phases, 'phase-2')).toEqual({ ok: false, rule: 'previous_phase_open' });
    expect(canStartPhase(phases, 'phase-1')).toEqual({ ok: false, rule: 'invalid_state' });
    expect(canStartPhase([phase(1, { status: 'done' }), phase(2)], 'phase-2')).toEqual({
      ok: true,
    });
    expect(canStartPhase([phase(1)], 'phase-1')).toEqual({ ok: true });
  });

  it('phase with open steps cannot complete', () => {
    const current = phase(1, { status: 'in_progress' });
    expect(canCompletePhase(current, [step(1, { status: 'done' }), step(2)], null)).toEqual({
      ok: false,
      rule: 'steps_open',
    });
    expect(canCompletePhase(current, [step(1, { status: 'done' })], null)).toEqual({ ok: true });
  });

  it('phase with approval waits for it', () => {
    const current = phase(1, { status: 'awaiting_approval', requiresApproval: true });
    const steps = [step(1, { status: 'done' })];
    expect(canCompletePhase(current, steps, null)).toEqual({
      ok: false,
      rule: 'approval_required',
    });
    expect(canCompletePhase(current, steps, 'pending')).toEqual({
      ok: false,
      rule: 'approval_required',
    });
    expect(canCompletePhase(current, steps, 'approved')).toEqual({ ok: true });
    expect(canCompletePhase(phase(1), steps, 'approved')).toEqual({
      ok: false,
      rule: 'invalid_state',
    });
  });
});

describe('nextChainedStep', () => {
  it('chained step follows the done one', () => {
    const steps = [
      step(1, { status: 'done' }),
      step(2, { chained: true }),
      step(3, { chained: true }),
      step(1, { id: 'other', phaseId: 'phase-2', chained: false }),
    ];
    expect(nextChainedStep(steps, 'step-1')).toEqual({ id: 'step-2' });
    expect(nextChainedStep(steps, 'step-3')).toBeNull();
  });

  it('a step that is not chained is never started automatically', () => {
    expect(nextChainedStep([step(1, { status: 'done' }), step(2)], 'step-1')).toBeNull();
  });
});

describe('planWeeks', () => {
  it('plan weeks cover the phase dates', () => {
    expect(
      planWeeks(
        [
          { id: 'a', startedOn: '2026-10-12', dueOn: '2026-10-30' },
          { id: 'b', startedOn: null, dueOn: '2026-11-20' },
          { id: 'c', startedOn: null, dueOn: null },
        ],
        '2026-10-12',
      ),
    ).toEqual([
      { phaseId: 'a', startWeek: 0, endWeek: 2 },
      { phaseId: 'b', startWeek: 2, endWeek: 5 },
      { phaseId: 'c', startWeek: 5, endWeek: 5 },
    ]);
  });

  it('never ends before it starts', () => {
    expect(
      planWeeks([{ id: 'a', startedOn: '2026-11-02', dueOn: '2026-10-20' }], '2026-10-12'),
    ).toEqual([{ phaseId: 'a', startWeek: 3, endWeek: 3 }]);
  });
});
