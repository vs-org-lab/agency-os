import {
  FINAL_CODES,
  PIPELINE_STAGES,
  stageOf,
  type PipelineCode,
  type PipelineStage,
} from './codes';

export type PendingModule = 'diagnosis' | 'documents' | 'billing' | 'retainers';

export type TransitionRefusal =
  | 'same_code'
  | 'not_allowed'
  | 'final_state'
  | 'reason_required'
  | 'founder_only'
  | 'call_required'
  | 'call_outcome_required'
  | 'module_pending';

export type TransitionFacts = {
  hasScheduledCall: boolean;
  hasCompletedCallWithOutcome: boolean;
};

export type TransitionActor = 'system' | 'founder' | 'staff';

export type TransitionInput = {
  from: PipelineCode;
  to: PipelineCode;
  previousOpenCode: PipelineCode | null;
  actor: TransitionActor;
  reason: string | null;
  facts: TransitionFacts;
};

export type TransitionDecision =
  { allowed: true } | { allowed: false; rule: TransitionRefusal; module?: PendingModule };

export const ENABLED_STAGES: ReadonlySet<PipelineStage> = new Set(['pre_sale', 'off_cycle']);

export const STAGE_MODULE: Readonly<Partial<Record<PipelineStage, PendingModule>>> = {
  core: 'diagnosis',
  orbit: 'documents',
  gravity: 'retainers',
  constellation: 'retainers',
};

const STAGE_LINKS: ReadonlyArray<readonly [PipelineCode, PipelineCode]> = [
  ['0.4', '1.1'],
  ['0.4', '2.1'],
  ['1.6', '2.1'],
  ['2.10', '3.1'],
  ['2.10', '4.1'],
  ['3.6', '4.1'],
  ['4.4', '4.1'],
];

const PAUSED_CODES: readonly PipelineCode[] = ['X.1', 'X.2'];

type Movement = 'forward' | 'back';

function codesOfStage(stage: PipelineStage): readonly PipelineCode[] {
  return PIPELINE_STAGES.find((entry) => entry.stage === stage)?.codes ?? [];
}

function movementBetween(from: PipelineCode, to: PipelineCode): Movement | null {
  if (STAGE_LINKS.some(([linkFrom, linkTo]) => linkFrom === from && linkTo === to)) {
    return 'forward';
  }
  const stage = stageOf(from);
  if (stage === 'off_cycle' || stageOf(to) !== stage) return null;
  const codes = codesOfStage(stage);
  const offset = codes.indexOf(to) - codes.indexOf(from);
  if (offset === 1) return 'forward';
  if (offset === -1) return 'back';
  return null;
}

function hasReason(reason: string | null): boolean {
  return reason !== null && reason.trim() !== '';
}

function refuse(rule: TransitionRefusal, module?: PendingModule): TransitionDecision {
  return module ? { allowed: false, rule, module } : { allowed: false, rule };
}

export function evaluateTransition(input: TransitionInput): TransitionDecision {
  const { from, to, actor, reason, facts } = input;

  if (from === to) return refuse('same_code');
  if (FINAL_CODES.includes(from)) return refuse('final_state');

  if (stageOf(to) === 'off_cycle') {
    if (to === 'X.4' && !hasReason(reason)) return refuse('reason_required');
    return { allowed: true };
  }

  if (PAUSED_CODES.includes(from)) {
    return to === input.previousOpenCode ? { allowed: true } : refuse('not_allowed');
  }

  const movement = movementBetween(from, to);
  if (!movement) return refuse('not_allowed');

  const targetStage = stageOf(to);
  if (!ENABLED_STAGES.has(targetStage)) return refuse('module_pending', STAGE_MODULE[targetStage]);

  if (movement === 'back') {
    if (actor === 'staff') return refuse('founder_only');
    if (!hasReason(reason)) return refuse('reason_required');
    return { allowed: true };
  }

  if (from === '0.2' && to === '0.3' && !facts.hasScheduledCall) return refuse('call_required');
  if (from === '0.3' && to === '0.4' && !facts.hasCompletedCallWithOutcome) {
    return refuse('call_outcome_required');
  }
  return { allowed: true };
}
