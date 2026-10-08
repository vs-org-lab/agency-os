'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Checkbox } from '@agency-os/ui/components/checkbox';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import type { RecordingView } from '@/modules/diagnosis/server';
import { MAX_RECORDING_BYTES, RECORDING_EXTENSIONS } from '@/modules/diagnosis';
import type { RecordingActionResult, StartRecordingResult } from '../recording-actions';
import { recordingError, RecordingStatus, type RecordingErrorCode } from '../recording-status';
import { openPendingStore } from './pending-store';
import {
  audioTypeForFile,
  formatElapsed,
  RECORDING_CONTENT_TYPE,
  RECORDING_MAX_MS,
  RecordingCaptureError,
  recordStreams,
  startCapture,
  uploadTrack,
  type CapturedStreams,
  type RecordedTracks,
} from './recorder';

export type RecordingPanelActions = {
  start(
    engagementId: string,
    input: { source: 'call' | 'upload'; consent: boolean; contentType: string },
  ): Promise<StartRecordingResult>;
  confirm(recordingId: string, dealId: string): Promise<RecordingActionResult>;
  retry(recordingId: string, dealId: string): Promise<RecordingActionResult>;
};

type Phase = { kind: 'idle' } | { kind: 'recording'; startedAt: number } | { kind: 'uploading' };

type ActiveSession = {
  streams: CapturedStreams;
  recording: { stop(): Promise<RecordedTracks> };
  limit: number;
};

const ACCEPTED_AUDIO = [
  ...Object.keys(RECORDING_EXTENSIONS),
  ...Object.values(RECORDING_EXTENSIONS).map((extension) => `.${extension}`),
].join(',');

const FAILED = { ok: false, code: 'not_found' } as const;

export function RecordingPanel({
  engagementId,
  dealId,
  latest,
  actions,
}: {
  engagementId: string;
  dealId: string;
  latest: RecordingView | null;
  actions: RecordingPanelActions;
}) {
  const t = useTranslations('diagnosis.recording');
  const router = useRouter();
  const store = useMemo(() => openPendingStore(engagementId), [engagementId]);
  const session = useRef<ActiveSession | null>(null);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<RecordingErrorCode | null>(null);
  const [recovered, setRecovered] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    store
      .load()
      .then((pending) => setRecovered(pending !== null))
      .catch(() => setRecovered(false));
  }, [store]);

  useEffect(() => {
    if (phase.kind !== 'recording') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase.kind]);

  useEffect(() => {
    if (phase.kind === 'idle') return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [phase.kind]);

  function fail(code: string) {
    setError(recordingError(code));
    setPhase({ kind: 'idle' });
  }

  async function send(
    source: 'call' | 'upload',
    tracks: { client: Blob; studio: Blob | null },
    contentType: string,
    fromStore: boolean,
  ) {
    setPhase({ kind: 'uploading' });
    setError(null);
    const started = await actions
      .start(engagementId, { source, consent: true, contentType })
      .catch(() => FAILED);
    if (!started.ok) return fail(started.code);
    for (const upload of started.uploads) {
      const blob = upload.track === 'client' ? tracks.client : tracks.studio;
      if (!blob || !(await uploadTrack(upload.url, blob))) {
        if (fromStore) setRecovered(true);
        return fail('upload_failed');
      }
    }
    const confirmed = await actions.confirm(started.recordingId, dealId).catch(() => FAILED);
    if (!confirmed.ok) {
      if (fromStore) setRecovered(true);
      return fail(confirmed.code);
    }
    if (fromStore) {
      await store.clear().catch(() => undefined);
      setRecovered(false);
    }
    setPhase({ kind: 'idle' });
    router.refresh();
  }

  async function stopRecording() {
    const current = session.current;
    if (!current) return;
    session.current = null;
    window.clearTimeout(current.limit);
    setPhase({ kind: 'uploading' });
    const tracks = await current.recording.stop();
    current.streams.release();
    await send('call', tracks, RECORDING_CONTENT_TYPE, true);
  }

  async function startRecording() {
    if (!consent) return setError('consent_required');
    if (typeof MediaRecorder === 'undefined') return setError('unsupported');
    setError(null);
    let streams: CapturedStreams;
    try {
      streams = await startCapture();
    } catch (failure) {
      return setError(
        failure instanceof RecordingCaptureError ? failure.code : 'permission_denied',
      );
    }
    await store.clear().catch(() => undefined);
    session.current = {
      streams,
      recording: recordStreams(streams, store),
      limit: window.setTimeout(() => void stopRecording(), RECORDING_MAX_MS),
    };
    streams.onEnded(() => void stopRecording());
    const startedAt = Date.now();
    setNow(startedAt);
    setPhase({ kind: 'recording', startedAt });
  }

  async function sendRecovered() {
    if (!consent) return setError('consent_required');
    const pending = await store.load().catch(() => null);
    if (!pending) {
      setRecovered(false);
      return;
    }
    await send(pending.studio ? 'call' : 'upload', pending, RECORDING_CONTENT_TYPE, true);
  }

  async function discardRecovered() {
    await store.clear().catch(() => undefined);
    setRecovered(false);
  }

  async function uploadFile(file: File) {
    if (!consent) return setError('consent_required');
    const contentType = audioTypeForFile(file);
    if (!contentType) return setError('file_type');
    if (file.size > MAX_RECORDING_BYTES) return setError('file_too_large');
    await send(
      'upload',
      { client: new Blob([file], { type: contentType }), studio: null },
      contentType,
      false,
    );
  }

  const busy = phase.kind !== 'idle';
  return (
    <section
      aria-labelledby="recording-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <h2 id="recording-title" className="text-title-sm text-text">
        {t('title')}
      </h2>

      <div className="flex flex-col gap-1">
        <div className="flex items-start gap-3">
          <Checkbox
            id="recording-consent"
            checked={consent}
            disabled={busy}
            onCheckedChange={(checked) => {
              setConsent(checked === true);
              setError(null);
            }}
          />
          <Label htmlFor="recording-consent" className="text-body-sm text-text">
            {t('consent')}
          </Label>
        </div>
        <p className="pl-7 text-caption text-text-secondary">{t('consentHint')}</p>
      </div>

      {recovered && phase.kind === 'idle' ? (
        <div className="flex flex-col gap-2 rounded-md bg-warning-bg p-3">
          <p className="text-body-sm text-warning">{t('recovered')}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void sendRecovered()}>
              {t('sendRecovered')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void discardRecovered()}>
              {t('discardRecovered')}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {phase.kind === 'recording' ? (
          <>
            <Button type="button" variant="destructive" onClick={() => void stopRecording()}>
              {t('stop')}
            </Button>
            <span className="text-body-sm text-text tabular-nums">
              {t('elapsed', { time: formatElapsed(now - phase.startedAt) })}
            </span>
          </>
        ) : (
          <Button type="button" disabled={busy || recovered} onClick={() => void startRecording()}>
            {t('start')}
          </Button>
        )}
        {phase.kind === 'uploading' ? (
          <span className="text-body-sm text-text-secondary" aria-live="polite">
            {t('uploading')}
          </span>
        ) : null}
      </div>
      <p className="text-caption text-text-secondary">{t('shareHint')}</p>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Label htmlFor="recording-file">{t('upload')}</Label>
        <Input
          id="recording-file"
          type="file"
          accept={ACCEPTED_AUDIO}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void uploadFile(file);
          }}
        />
        <p className="text-caption text-text-secondary">{t('uploadHint')}</p>
      </div>

      {latest && phase.kind === 'idle' ? (
        <RecordingStatus latest={latest} dealId={dealId} retry={actions.retry} />
      ) : null}

      {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
    </section>
  );
}
