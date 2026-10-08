import type { PipelineCode } from '@/modules/commercial';

export const MIN_INTERNAL_ITEMS = 2;

export type CoreReadiness = {
  briefingHasContent: boolean;
  frontsScored: boolean;
  findingsWithoutEvidence: number;
  internalItems: number;
  crossReviewed: boolean;
  presentationAttached: boolean;
  proposalSessionScheduled: boolean;
  presentationShared: boolean;
};

export type ReadinessGap =
  | 'briefing_empty'
  | 'fronts_unscored'
  | 'findings_without_evidence'
  | 'internal_items_below_minimum'
  | 'cross_review_missing'
  | 'presentation_missing'
  | 'proposal_session_missing'
  | 'presentation_not_shared';

export function stageOneGaps(to: PipelineCode, readiness: CoreReadiness): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];
  switch (to) {
    case '1.3':
      if (!readiness.briefingHasContent) gaps.push('briefing_empty');
      break;
    case '1.4':
      if (!readiness.frontsScored) gaps.push('fronts_unscored');
      if (readiness.findingsWithoutEvidence > 0) gaps.push('findings_without_evidence');
      if (readiness.internalItems < MIN_INTERNAL_ITEMS) gaps.push('internal_items_below_minimum');
      if (!readiness.crossReviewed) gaps.push('cross_review_missing');
      break;
    case '1.5':
      if (!readiness.presentationAttached) gaps.push('presentation_missing');
      if (!readiness.proposalSessionScheduled) gaps.push('proposal_session_missing');
      break;
    case '1.6':
      if (!readiness.presentationShared) gaps.push('presentation_not_shared');
      break;
    default:
      break;
  }
  return gaps;
}
