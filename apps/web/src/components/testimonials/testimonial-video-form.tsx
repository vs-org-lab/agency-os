'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@agency-os/ui/components/checkbox';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import {
  TestimonialRecorder,
  type TestimonialRecording,
} from '@/components/media/testimonial-recorder';
import { uploadToSignedUrl } from '@/components/proofing/upload';
import {
  MAX_TESTIMONIAL_VIDEO_BYTES,
  MAX_TESTIMONIAL_VIDEO_SECONDS,
  TESTIMONIAL_QUESTION_COUNT,
  type TestimonialChapter,
  type TestimonialVideoStartInput,
  type TestimonialView,
} from '@/modules/testimonials';

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; code: string };

export type TestimonialVideoActions = {
  begin: (input: TestimonialVideoStartInput) => Promise<ActionResult<{ uploadUrl: string }>>;
  finish: (input: {
    projectId: string;
    durationSeconds: number;
    chapters: TestimonialChapter[];
  }) => Promise<ActionResult>;
};

const QUESTION_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;

/** The video testimonial: the author's details and consent, then the recorder with its questions. */
export function TestimonialVideoForm({
  projectId,
  initial,
  actions,
  onWriteInstead,
}: {
  projectId: string;
  initial: TestimonialView | null;
  actions: TestimonialVideoActions;
  onWriteInstead: () => void;
}) {
  const t = useTranslations('testimonials.video');
  const id = useId();
  const [authorName, setAuthorName] = useState(initial?.authorName ?? '');
  const [authorRole, setAuthorRole] = useState(initial?.authorRole ?? '');
  const [recordConsent, setRecordConsent] = useState(false);
  const [publishConsent, setPublishConsent] = useState(initial?.consentPublish ?? false);
  const [outcome, setOutcome] = useState<'sent' | 'failed' | null>(null);
  const ready = recordConsent && authorName.trim() !== '';

  const submit = async (recording: TestimonialRecording): Promise<boolean> => {
    setOutcome(null);
    if (recording.blob.size > MAX_TESTIMONIAL_VIDEO_BYTES) {
      setOutcome('failed');
      return false;
    }
    const started = await actions
      .begin({
        projectId,
        authorName: authorName.trim(),
        authorRole: authorRole.trim(),
        consentPublish: publishConsent,
        consentRecording: recordConsent,
        contentType: recording.contentType,
      })
      .catch(() => null);
    if (!started?.ok) {
      setOutcome('failed');
      return false;
    }
    const file = new File([recording.blob], 'testimonial', { type: recording.contentType });
    const uploaded = await uploadToSignedUrl(started.uploadUrl, file);
    const finished = uploaded
      ? await actions
          .finish({
            projectId,
            durationSeconds: recording.durationSeconds,
            chapters: recording.chapters,
          })
          .catch(() => null)
      : null;
    setOutcome(finished?.ok ? 'sent' : 'failed');
    return finished?.ok === true;
  };

  if (outcome === 'sent') return <FormMessage tone="success">{t('sent')}</FormMessage>;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text-secondary">
        {t('intro', { max: MAX_TESTIMONIAL_VIDEO_SECONDS / 60 })}
      </p>
      {initial?.hasVideo ? (
        <p className="text-body-sm text-text-secondary">{t('hasVideo')}</p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-name`}>{t('name')}</Label>
          <Input
            id={`${id}-name`}
            autoComplete="name"
            maxLength={120}
            value={authorName}
            onChange={(event) => setAuthorName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-role`}>{t('role')}</Label>
          <Input
            id={`${id}-role`}
            autoComplete="organization-title"
            maxLength={120}
            value={authorRole}
            onChange={(event) => setAuthorRole(event.target.value)}
          />
        </div>
      </div>
      <div className="flex items-start gap-3">
        <Checkbox
          id={`${id}-record`}
          checked={recordConsent}
          onCheckedChange={(checked) => setRecordConsent(checked === true)}
        />
        <Label htmlFor={`${id}-record`} className="text-body-sm text-text">
          {t('recordConsent')}
        </Label>
      </div>
      <div className="flex items-start gap-3">
        <Checkbox
          id={`${id}-publish`}
          checked={publishConsent}
          onCheckedChange={(checked) => setPublishConsent(checked === true)}
        />
        <Label htmlFor={`${id}-publish`} className="text-body-sm text-text">
          {t('publishConsent')}
        </Label>
      </div>
      {!ready ? <p className="text-caption text-text-secondary">{t('consentRequired')}</p> : null}
      <TestimonialRecorder
        questions={QUESTION_KEYS.slice(0, TESTIMONIAL_QUESTION_COUNT).map((key) => ({
          topic: t(`questions.${key}.topic`),
          text: t(`questions.${key}.text`),
        }))}
        maxSeconds={MAX_TESTIMONIAL_VIDEO_SECONDS}
        disabled={!ready}
        submit={submit}
        onWriteInstead={onWriteInstead}
      />
      {outcome === 'failed' ? <FormMessage tone="danger">{t('failed')}</FormMessage> : null}
    </div>
  );
}
