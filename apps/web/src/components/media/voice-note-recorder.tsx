'use client';

import { useEffect, useState } from 'react';
import { Mic, Pause, Play, Square, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { DynamicIsland } from '@agency-os/ui/components/dynamic-island';
import { TimeScrubber } from '@agency-os/ui/components/time-scrubber';
import { MAX_VOICE_NOTE_SECONDS } from '@/modules/voice-notes';
import { useAudioLevel } from './use-audio-level';
import { usePlayback } from './use-playback';
import { formatElapsed, recorderSupported, useRecorder, type Recording } from './use-recorder';

export type VoiceNoteRecorderProps = {
  /** Sends the recording; resolves to false when it could not be sent. */
  submit: (recording: Recording) => Promise<boolean>;
  onSent?: () => void;
  disabled?: boolean;
};

function usePreviewUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob || typeof URL.createObjectURL !== 'function') return;
    const created = URL.createObjectURL(blob);
    setUrl(created);
    return () => {
      URL.revokeObjectURL?.(created);
      setUrl(null);
    };
  }, [blob]);
  return url;
}

/** A microphone button beside the text field: record up to three minutes, review, send or delete. */
export function VoiceNoteRecorder({ submit, onSent, disabled }: VoiceNoteRecorderProps) {
  const t = useTranslations('media.voiceNote');
  const recorder = useRecorder({
    kind: 'audio',
    maxSeconds: MAX_VOICE_NOTE_SECONDS,
    audioBitsPerSecond: 32_000,
  });
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const level = useAudioLevel(recorder.status === 'recording' ? recorder.stream : null);
  const previewUrl = usePreviewUrl(recorder.recording?.blob);
  const playback = usePlayback<HTMLAudioElement>();
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(recorderSupported()), []);
  const unsupported = !supported || recorder.failure === 'unsupported';
  const { recording } = recorder;

  const send = async () => {
    if (!recording) return;
    setSending(true);
    setFailed(false);
    const sent = await submit(recording).catch(() => false);
    setSending(false);
    if (!sent) {
      setFailed(true);
      return;
    }
    recorder.discard();
    onSent?.();
  };

  if (recorder.status === 'recording' || recorder.status === 'paused') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <DynamicIsland
          status={recorder.status === 'recording' ? 'recording' : 'paused'}
          label={t('recording')}
          timer={formatElapsed(recorder.elapsedMs)}
          actions={
            <Button type="button" size="sm" variant="outline" onClick={recorder.stop}>
              <Square aria-hidden="true" />
              {t('stop')}
            </Button>
          }
        />
        <div aria-hidden="true" className="bg-border h-1.5 w-24 overflow-hidden rounded-full">
          <div
            className="bg-brand h-full origin-left rounded-full transition-transform"
            style={{ transform: `scaleX(${level})` }}
          />
        </div>
      </div>
    );
  }

  if (recorder.status === 'stopped' && recording) {
    return (
      <div className="flex flex-col gap-3">
        {previewUrl ? (
          <audio src={previewUrl} preload="metadata" {...playback.mediaProps} className="hidden" />
        ) : null}
        <p className="text-caption text-text-secondary">
          {recorder.limitReached ? t('limit', { max: '3:00' }) : t('ready')}
        </p>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label={playback.playing ? t('pause') : t('play')}
            onClick={playback.toggle}
            disabled={!previewUrl}
          >
            {playback.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </Button>
          <TimeScrubber
            label={t('position')}
            value={playback.time}
            duration={recording.durationSeconds}
            onValueChange={playback.seek}
            className="min-w-0 flex-1"
          />
        </div>
        {failed ? (
          <p role="alert" className="text-body-sm text-danger">
            {t('failed')}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void send()} disabled={sending}>
            {sending ? t('sending') : t('send')}
          </Button>
          <Button type="button" variant="outline" onClick={recorder.discard} disabled={sending}>
            <Trash2 aria-hidden="true" />
            {t('delete')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || unsupported || recorder.status === 'starting'}
          onClick={() => void recorder.start()}
        >
          <Mic aria-hidden="true" />
          {t('record')}
        </Button>
      </div>
      {recorder.failure === 'denied' ? (
        <p role="alert" className="text-body-sm text-danger">
          {t('denied')}
        </p>
      ) : null}
      {unsupported ? (
        <p role="alert" className="text-body-sm text-text-secondary">
          {t('unsupported')}
        </p>
      ) : null}
    </div>
  );
}
