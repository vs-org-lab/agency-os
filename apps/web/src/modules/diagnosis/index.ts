export { DEFAULT_BRIEFING_GUIDE, DEFAULT_ORBIT_GRID } from './templates/defaults';
export {
  SUGGESTED_ONBOARDING_REQUESTS,
  VISUAL_IDENTITY_QUESTION_ID,
  withSuggestedRequests,
} from './templates/onboarding-suggestions';
export {
  BRIEFING_BLOCK_COUNT,
  briefingGuideSchema,
  ORBIT_FRONT_MAX_POINTS,
  ORBIT_FRONTS,
  orbitGridSchema,
  answerValues,
  MAX_ONBOARDING_REQUESTS,
  ONBOARDING_MODULE_CODES,
  ONBOARDING_REQUEST_KINDS,
  type BriefingAnswer,
  type BriefingBlock,
  type BriefingGuide,
  type Localized,
  type OnboardingCondition,
  type OnboardingRequest,
  type OnboardingRequestKind,
  type OrbitCriterion,
  type OrbitGrid,
} from './templates/definitions';
export { addBusinessDays } from './domain/business-days';
export { proposeLane } from './domain/lanes';
export { orbitIndex, type OrbitIndexRow, type ScoreEntry } from './domain/orbit-index';
export {
  MIN_INTERNAL_ITEMS,
  stageOneGaps,
  type CoreReadiness,
  type ReadinessGap,
} from './domain/readiness';
export { parseBriefingDraft } from './assistant/parse';
export {
  createManualAssistant,
  type CoreAssistant,
  type CoreAssistantDraft,
} from './assistant/port';
export {
  buildPrompt,
  redactContactDetails,
  type CoreAssistantRequest,
  type NarrativeFinding,
} from './assistant/prompts';
export {
  isRecordingContentType,
  MAX_RECORDING_BYTES,
  RECORDING_EXTENSIONS,
  type RecordingContentType,
} from './transcription/storage';
export type { CoreOnboarding } from './onboarding-source';
