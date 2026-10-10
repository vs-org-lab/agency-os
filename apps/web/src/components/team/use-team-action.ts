'use client';

import { useState, useTransition } from 'react';
import { teamError, type TeamActionResult, type TeamError } from './team-errors';

export type TeamOutcome = { ok: true; key: string } | { ok: false; error: TeamError } | null;

/** Runs a team action, keeping the last outcome for the message under the control. */
export function useTeamAction() {
  const [outcome, setOutcome] = useState<TeamOutcome>(null);
  const [pending, startTransition] = useTransition();
  const run = (key: string, action: () => Promise<TeamActionResult>, onSuccess?: () => void) =>
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false, code: 'not_found' }) as const);
      if (result.ok) onSuccess?.();
      setOutcome(result.ok ? { ok: true, key } : { ok: false, error: teamError(result.code) });
    });
  return { outcome, setOutcome, pending, run };
}
