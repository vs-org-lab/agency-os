'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Mic, Pause, Play, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { DynamicIsland } from '@agency-os/ui/components/dynamic-island';
import { TimeScrubber } from '@agency-os/ui/components/time-scrubber';
import type { TestimonialChapter } from '@/modules/testimonials';
import { useAudioLevel } from './use-audio-level';
import { useMediaDevices, type MediaDeviceOption } from './use-media-devices';
import { usePlayback } from './use-playback';
import { formatElapsed, useRecorder, type Recording } from './use-recorder';

export type TestimonialQuestion = { topic: string; text: string };

export type TestimonialRecording = Recording & { chapters: TestimonialChapter[] };

export type TestimonialRecorderProps = {
  questions: readonly TestimonialQuestion[];
  maxSeconds: number;
  /** Holds the recording back until the author has consented. */
  disabled?: boolean;
  /** Sends the recording; resolves to false when it could not be sent. */
  submit: (recording: TestimonialRecording) => Promise<boolean>;
  onSent?: () => void;
  /** The author wants to write instead, or the camera is not available. */
  onWriteInstead: () => void;
};

function DeviceSelect({
  label,
  icon,
  options,
  value,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  options: MediaDeviceOption[];
  value: string;
  onChange: (deviceId: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <label className="flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-xs text-white backdrop-blur">
      {icon}
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-40 cursor-pointer truncate bg-transparent outline-none [&>option]:text-black"
      >
        {options.map((option) => (
          <option key={option.deviceId} value={option.deviceId}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The video testimonial recorder: a camera preview with the questions laid over it one at a time,
 * a status pill with the controls, and a review step with a time bar and the question marks.
 */
export function TestimonialRecorder({
  questions,
  maxSeconds,
  disabled,
  submit,
  onSent,
  onWriteInstead,
}: TestimonialRecorderProps) {
  const t = useTranslations('media.recorder');
  const [cameraId, setCameraId] = useState('');
  const [microphoneId, setMicrophoneId] = useState('');
  const recorder = useRecorder({
    kind: 'video',
    maxSeconds,
    audioDeviceId: microphoneId || undefined,
    videoDeviceId: cameraId || undefined,
    audioBitsPerSecond: 64_000,
    videoBitsPerSecond: 1_000_000,
  });
  const { status, stream, recording, open } = recorder;
  const devices = useMediaDevices(stream !== null);
  const level = useAudioLevel(stream);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [chapters, setChapters] = useState<TestimonialChapter[]>([]);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const previewRef = useRef<HTMLVideoElement>(null);
  const playback = usePlayback<HTMLVideoElement>();
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);

  // The camera opens with the page, again after a discarded take and when a device is changed.
  useEffect(() => {
    if (status === 'idle') void open();
  }, [open, status]);

  useEffect(() => {
    if (previewRef.current) previewRef.current.srcObject = stream;
  }, [stream, status]);

  useEffect(() => {
    if (!recording || typeof URL.createObjectURL !== 'function') return;
    const url = URL.createObjectURL(recording.blob);
    setReviewUrl(url);
    return () => {
      URL.revokeObjectURL?.(url);
      setReviewUrl(null);
    };
  }, [recording]);

  const begin = async () => {
    setQuestionIndex(0);
    setChapters([{ index: 0, startedAtMs: 0 }]);
    setFailed(false);
    await recorder.start();
  };

  const next = () => {
    const index = Math.min(questionIndex + 1, questions.length - 1);
    if (index === questionIndex) return;
    setQuestionIndex(index);
    setChapters((current) => [
      ...current,
      { index, startedAtMs: Math.min(recorder.elapsedMs, maxSeconds * 1000) },
    ]);
  };

  const send = async () => {
    if (!recording) return;
    setSending(true);
    setFailed(false);
    const sent = await submit({ ...recording, chapters }).catch(() => false);
    setSending(false);
    if (!sent) {
      setFailed(true);
      return;
    }
    onSent?.();
  };

  const question = questions[questionIndex];
  const recordingNow = status === 'recording' || status === 'paused';

  if (recorder.failure) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-body-sm text-danger">
          {t(recorder.failure === 'denied' ? 'denied' : 'unsupported')}
        </p>
        <Button type="button" variant="outline" onClick={onWriteInstead}>
          {t('writeInstead')}
        </Button>
      </div>
    );
  }

  if (status === 'stopped' && recording) {
    return (
      <div className="flex flex-col gap-4">
        <h3 className="text-title-sm text-text">{t('review')}</h3>
        <video
          src={reviewUrl ?? undefined}
          playsInline
          preload="metadata"
          aria-label={t('review')}
          {...playback.mediaProps}
          className="aspect-video w-full rounded-lg bg-black"
        />
        {recorder.limitReached ? (
          <p role="status" className="text-body-sm text-text-secondary">
            {t('limit', { max: `${Math.round(maxSeconds / 60)} min` })}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <Button type="button" size="icon" variant="outline" onClick={playback.toggle}>
            {playback.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            <span className="sr-only">{playback.playing ? t('pause') : t('resume')}</span>
          </Button>
          <TimeScrubber
            label={t('position')}
            value={playback.time}
            duration={recording.durationSeconds}
            onValueChange={playback.seek}
            markers={chapters
              .filter((chapter) => chapter.startedAtMs / 1000 <= recording.durationSeconds)
              .map((chapter) => ({
                time: chapter.startedAtMs / 1000,
                label: t('chapter', { index: chapter.index + 1 }),
              }))}
            className="min-w-0 flex-1"
          />
        </div>
        {failed ? (
          <p role="alert" className="text-body-sm text-danger">
            {t('failed')}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={sending} onClick={recorder.discard}>
            {t('again')}
          </Button>
          <Button type="button" disabled={sending} onClick={() => void send()}>
            {sending ? t('sending') : t('send')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
        <video
          ref={previewRef}
          autoPlay
          muted
          playsInline
          aria-label={t('preview')}
          className="size-full -scale-x-100 object-cover"
        />
        {!recordingNow ? (
          <div className="absolute top-3 right-3 flex flex-wrap justify-end gap-2">
            <DeviceSelect
              label={t('camera')}
              icon={<Camera aria-hidden="true" className="size-3.5" />}
              options={devices.cameras}
              value={cameraId || devices.cameras[0]?.deviceId || ''}
              onChange={setCameraId}
            />
            <DeviceSelect
              label={t('microphone')}
              icon={<Mic aria-hidden="true" className="size-3.5" />}
              options={devices.microphones}
              value={microphoneId || devices.microphones[0]?.deviceId || ''}
              onChange={setMicrophoneId}
            />
          </div>
        ) : null}
        {recordingNow && question ? (
          <div
            aria-live="polite"
            className="absolute inset-x-3 bottom-3 rounded-md bg-black/60 p-3 text-white backdrop-blur"
          >
            <p className="text-xs text-white/70">
              {t('question', {
                current: questionIndex + 1,
                total: questions.length,
                topic: question.topic,
              })}
            </p>
            <p className="text-body">{question.text}</p>
          </div>
        ) : null}
        {!recordingNow && stream ? (
          <div
            role="meter"
            aria-label={t('level')}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={level}
            className="absolute inset-x-0 bottom-0 h-1 bg-white/20"
          >
            <div
              className="bg-success h-full origin-left transition-transform"
              style={{ transform: `scaleX(${level})` }}
            />
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {recordingNow ? (
          <>
            <DynamicIsland
              status={status === 'recording' ? 'recording' : 'paused'}
              label={status === 'recording' ? t('recording') : t('paused')}
              timer={formatElapsed(recorder.elapsedMs)}
              actions={
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={status === 'recording' ? recorder.pause : recorder.resume}
                  >
                    {status === 'recording' ? t('pause') : t('resume')}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={recorder.stop}>
                    <Square aria-hidden="true" />
                    {t('stop')}
                  </Button>
                </>
              }
            />
            {questionIndex < questions.length - 1 ? (
              <Button type="button" onClick={next}>
                {t('next')}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={onWriteInstead}>
              {t('writeInstead')}
            </Button>
            <Button
              type="button"
              disabled={disabled || !stream || status === 'starting'}
              onClick={() => void begin()}
            >
              {t('start')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
