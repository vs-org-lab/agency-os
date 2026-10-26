'use client';

import { Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { TimeScrubber } from '@agency-os/ui/components/time-scrubber';
import type { VoiceNoteView } from '@/modules/voice-notes';
import { usePlayback } from './use-playback';

/** A compact audio player for a voice note with its transcript underneath. */
export function VoiceNotePlayer({ note }: { note: VoiceNoteView }) {
  const t = useTranslations('media.voiceNote');
  const playback = usePlayback<HTMLAudioElement>();

  return (
    <div data-slot="voice-note" className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {note.audioUrl ? (
          <audio src={note.audioUrl} preload="none" {...playback.mediaProps} className="hidden" />
        ) : null}
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label={playback.playing ? t('pause') : t('play')}
          onClick={playback.toggle}
          disabled={!note.audioUrl}
        >
          {playback.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </Button>
        <TimeScrubber
          label={t('position')}
          value={playback.time}
          duration={note.durationSeconds}
          onValueChange={playback.seek}
          className="min-w-0 flex-1"
        />
      </div>
      <p className="text-body-sm text-text-secondary">
        {note.status === 'transcribed' ? (
          <>
            <span className="sr-only">{t('transcript')}</span>
            {note.transcript || t('noSpeech')}
          </>
        ) : note.status === 'failed' ? (
          t('transcriptFailed')
        ) : (
          t('transcribing')
        )}
      </p>
    </div>
  );
}
