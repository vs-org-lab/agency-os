'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { FormMessage } from '@/components/forms/form-message';
import type { RecordingView } from '@/modules/diagnosis/server';
import type { RecordingActionResult } from './recording-actions';

const STATUS_POLL_MS = 10_000;

const RECORDING_ERRORS = [
  'consent_required',
  'no_tab_audio',
  'permission_denied',
  'unsupported',
  'file_too_large',
  'file_type',
  'upload_failed',
  'upload_missing',
  'invalid_state',
  'not_found',
] as const;

export type RecordingErrorCode = (typeof RECORDING_ERRORS)[number];

export function recordingError(code: string): RecordingErrorCode {
  return (RECORDING_ERRORS as readonly string[]).includes(code)
    ? (code as RecordingErrorCode)
    : 'not_found';
}

/** Shows where the latest recording stands and refreshes the page until its transcript lands. */
export function RecordingStatus({
  latest,
  dealId,
  retry,
}: {
  latest: RecordingView;
  dealId: string;
  retry: (recordingId: string, dealId: string) => Promise<RecordingActionResult>;
}) {
  const t = useTranslations('diagnosis.recording');
  const router = useRouter();
  const [error, setError] = useState<RecordingErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  const transcribing = latest.status === 'uploaded' || latest.status === 'transcribing';
  useEffect(() => {
    if (!transcribing) return;
    const timer = window.setInterval(() => router.refresh(), STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [transcribing, router]);

  const status = latest.status === 'failed' && latest.expired ? 'expired' : latest.status;

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-body-sm text-text">{t(`status.${status}`)}</p>
        {status === 'failed' ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await retry(latest.id, dealId).catch(
                  () => ({ ok: false, code: 'not_found' }) as const,
                );
                if (!result.ok) return setError(recordingError(result.code));
                router.refresh();
              })
            }
          >
            {t('retry')}
          </Button>
        ) : null}
      </div>
      {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
    </div>
  );
}
