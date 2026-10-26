'use client';

import { useTranslations } from 'next-intl';
import type { VoiceNoteActions } from '@/components/media/send-voice-note';
import { ApprovalDecision, type DecideApproval } from '@/components/rooms/approval-decision';
import type { RoundsStatus } from '@/modules/proofing';

/**
 * The decision maker's approval of a file version, with the rounds used and, when the next change
 * request would pass the limit, the extra round notice before anything is sent (RN-42).
 */
export function DecisionPanel({
  approvalId,
  rounds,
  decide,
  voiceActions,
}: {
  approvalId: string;
  rounds: RoundsStatus;
  decide: DecideApproval;
  voiceActions?: VoiceNoteActions;
}) {
  const t = useTranslations('proofing.decision');
  const nextIsExtra = rounds.used + 1 > rounds.limit;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="text-body-sm text-text-secondary">
        {t('roundsUsed', { used: rounds.used, limit: rounds.limit })}
      </p>
      {nextIsExtra ? (
        <p className="rounded-md bg-warning-bg px-3 py-2 text-body-sm text-warning">
          {t('extraWarning', { limit: rounds.limit })}
        </p>
      ) : null}
      <ApprovalDecision approvalId={approvalId} decide={decide} voiceActions={voiceActions} />
    </div>
  );
}
