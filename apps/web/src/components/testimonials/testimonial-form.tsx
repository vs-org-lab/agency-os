'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Checkbox } from '@agency-os/ui/components/checkbox';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import {
  MAX_TESTIMONIAL_LENGTH,
  type TestimonialInput,
  type TestimonialView,
} from '@/modules/testimonials';

type SendResult = { ok: true } | { ok: false; code: string };

type Outcome = 'sent' | 'required' | 'failed' | null;

/** The decision maker's testimonial on a delivered project, with the permission to publish it. */
export function TestimonialForm({
  projectId,
  projectName,
  initial,
  send,
}: {
  projectId: string;
  projectName: string;
  initial: TestimonialView | null;
  send: (input: TestimonialInput) => Promise<SendResult>;
}) {
  const t = useTranslations('testimonials.form');
  const id = useId();
  const [body, setBody] = useState(initial?.body ?? '');
  const [authorName, setAuthorName] = useState(initial?.authorName ?? '');
  const [authorRole, setAuthorRole] = useState(initial?.authorRole ?? '');
  const [consent, setConsent] = useState(initial?.consentPublish ?? false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const errorId = `${id}-error`;
  const missingBody = outcome === 'required' && body.trim() === '';
  const missingName = outcome === 'required' && authorName.trim() === '';

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (body.trim() === '' || authorName.trim() === '') {
          setOutcome('required');
          (body.trim() === '' ? bodyRef : nameRef).current?.focus();
          return;
        }
        startTransition(async () => {
          const result = await send({
            projectId,
            body: body.trim(),
            authorName: authorName.trim(),
            authorRole: authorRole.trim(),
            consentPublish: consent,
          }).catch(() => ({ ok: false, code: 'not_found' }) as const);
          setOutcome(result.ok ? 'sent' : 'failed');
        });
      }}
      onChange={() => setOutcome(null)}
    >
      <p className="text-body text-text-secondary">{t('intro', { project: projectName })}</p>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-body`}>{t('body')}</Label>
        <Textarea
          id={`${id}-body`}
          ref={bodyRef}
          required
          aria-required
          aria-invalid={missingBody ? true : undefined}
          rows={6}
          maxLength={MAX_TESTIMONIAL_LENGTH}
          value={body}
          aria-describedby={missingBody ? `${id}-count ${errorId}` : `${id}-count`}
          onChange={(event) => setBody(event.target.value)}
        />
        <span id={`${id}-count`} className="text-caption text-text-secondary tabular-nums">
          {t('count', { used: body.length, max: MAX_TESTIMONIAL_LENGTH })}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-name`}>{t('name')}</Label>
          <Input
            id={`${id}-name`}
            ref={nameRef}
            required
            aria-required
            aria-invalid={missingName ? true : undefined}
            aria-describedby={missingName ? errorId : undefined}
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
          id={`${id}-consent`}
          checked={consent}
          onCheckedChange={(checked) => {
            setConsent(checked === true);
            setOutcome(null);
          }}
        />
        <Label htmlFor={`${id}-consent`} className="text-body-sm text-text">
          {t('consent')}
        </Label>
      </div>
      {outcome === 'sent' ? <FormMessage tone="success">{t('sent')}</FormMessage> : null}
      {outcome === 'required' || outcome === 'failed' ? (
        <FormMessage tone="danger" id={errorId}>
          {t(outcome)}
        </FormMessage>
      ) : null}
      <div className="md:w-72">
        <Button type="submit" disabled={pending} className="w-full">
          {initial ? t('update') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
