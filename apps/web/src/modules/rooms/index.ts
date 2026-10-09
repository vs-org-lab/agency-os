export {
  MAX_PHASES,
  MAX_STEPS_PER_PHASE,
  validateProcessDefinition,
  type ProcessDefinition,
  type ProcessPhaseDefinition,
  type ProcessStepDefinition,
} from './domain/template';
export {
  canCompletePhase,
  canStartPhase,
  type PhaseState,
  type PhaseStatus,
} from './domain/phases';
export { nextChainedStep, type StepState, type StepStatus } from './domain/steps';
export { planWeeks } from './domain/plan';
export { ORBIT_PROCESS, ORBIT_TEMPLATE_KEY } from './templates/defaults';
