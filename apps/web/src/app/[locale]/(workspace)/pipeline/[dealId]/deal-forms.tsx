'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { currencies } from '@agency-os/i18n';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { SubmitButton } from '@/components/forms/submit-button';
import type { PipelineCode } from '@/modules/commercial';
import { moveDealAction } from '../actions';
import { MoveDialog } from '../move-dialog';
import type { FormState } from './actions';

type BoundAction = (state: FormState, formData: FormData) => Promise<FormState>;

const FIELD = 'h-11 rounded-md border border-border bg-surface px-3 text-body text-text md:h-9';

export function DealMove({ dealId, code }: { dealId: string; code: PipelineCode }) {
  const t = useTranslations('commercial');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(true)}>
        {t('deal.move')}
      </Button>
      {message ? <FormMessage tone="danger">{message}</FormMessage> : null}
      <MoveDialog
        open={open}
        from={code}
        initialTarget={null}
        onOpenChange={setOpen}
        onConfirm={(to, reason) => {
          setOpen(false);
          startTransition(async () => {
            const result = await moveDealAction({ dealId, to, reason });
            setMessage(result.ok ? null : result.message);
            if (result.ok) router.refresh();
          });
        }}
      />
    </div>
  );
}

export function TrackingForm({
  action,
  defaults,
  staff,
}: {
  action: BoundAction;
  defaults: {
    nextStep: string | null;
    owner: string | null;
    dueOn: string | null;
    value: string | null;
    currency: string;
  };
  staff: Array<{ id: string; fullName: string }>;
}) {
  const t = useTranslations('commercial.deal.tracking');
  const [state, formAction] = useActionState(action, { status: 'idle' });

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      <div className="flex flex-col gap-2 md:col-span-2">
        <Label htmlFor="tracking-next-step">{t('nextStep')}</Label>
        <Input
          id="tracking-next-step"
          name="nextStep"
          defaultValue={defaults.nextStep ?? ''}
          maxLength={500}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="tracking-owner">{t('owner')}</Label>
        <select
          id="tracking-owner"
          name="owner"
          defaultValue={defaults.owner ?? ''}
          className={FIELD}
        >
          <option value="">{t('ownerNone')}</option>
          <option value="client">{t('ownerClient')}</option>
          {staff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.fullName}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="tracking-due">{t('dueOn')}</Label>
        <Input id="tracking-due" name="dueOn" type="date" defaultValue={defaults.dueOn ?? ''} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="tracking-value">{t('value')}</Label>
        <Input
          id="tracking-value"
          name="value"
          inputMode="decimal"
          defaultValue={defaults.value ?? ''}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="tracking-currency">{t('currency')}</Label>
        <select
          id="tracking-currency"
          name="currency"
          defaultValue={defaults.currency}
          className={FIELD}
        >
          {currencies.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        {state.status === 'saved' ? <FormMessage tone="success">{t('saved')}</FormMessage> : null}
        {state.status === 'error' ? <FormMessage tone="danger">{t('error')}</FormMessage> : null}
        <div className="md:w-40">
          <SubmitButton>{t('save')}</SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function ScheduleCallForm({
  action,
  kind,
}: {
  action: BoundAction;
  kind: 'discovery' | 'proposal_session';
}) {
  const t = useTranslations('commercial.deal.calls');
  const [state, formAction] = useActionState(action, { status: 'idle' });
  const [startIso, setStartIso] = useState('');

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <h3 className="text-title-sm text-text">
        {kind === 'proposal_session' ? t('scheduleSession') : t('schedule')}
      </h3>
      <p className="text-body-sm text-text-secondary">
        {kind === 'proposal_session' ? t('scheduleSessionHint') : t('scheduleHint')}
      </p>
      <input type="hidden" name="start" value={startIso} />
      <input type="hidden" name="kind" value={kind} />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="call-start">{t('start')}</Label>
          <Input
            id="call-start"
            type="datetime-local"
            required
            onChange={(event) => {
              const value = new Date(event.target.value);
              setStartIso(Number.isNaN(value.getTime()) ? '' : value.toISOString());
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="call-duration">{t('duration')}</Label>
          <Input
            id="call-duration"
            name="duration"
            type="number"
            min={15}
            max={180}
            step={15}
            defaultValue={kind === 'proposal_session' ? 60 : 45}
          />
        </div>
      </div>
      {state.status === 'error' ? (
        <FormMessage tone="danger">{t(`errors.${state.code}` as never)}</FormMessage>
      ) : null}
      <div className="md:w-48">
        <SubmitButton>
          {kind === 'proposal_session' ? t('scheduleSession') : t('schedule')}
        </SubmitButton>
      </div>
    </form>
  );
}

export function OutcomeForm({ action }: { action: BoundAction }) {
  const t = useTranslations('commercial.deal.calls');
  const [state, formAction] = useActionState(action, { status: 'idle' });

  return (
    <form action={formAction} className="grid gap-3 border-t border-border pt-3 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="outcome-status">{t('recordStatus')}</Label>
        <select id="outcome-status" name="status" defaultValue="completed" className={FIELD}>
          <option value="completed">{t('status.completed')}</option>
          <option value="no_show">{t('status.no_show')}</option>
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="outcome-value">{t('outcome')}</Label>
        <select id="outcome-value" name="outcome" defaultValue="" className={FIELD}>
          <option value="" />
          <option value="advance">{t('outcomes.advance')}</option>
          <option value="follow_up">{t('outcomes.follow_up')}</option>
          <option value="decline">{t('outcomes.decline')}</option>
        </select>
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        <Label htmlFor="outcome-reason">{t('reason')}</Label>
        <Input id="outcome-reason" name="reason" maxLength={500} />
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        <Label htmlFor="outcome-notes">{t('notes')}</Label>
        <Textarea id="outcome-notes" name="notes" rows={3} maxLength={5000} />
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        {state.status === 'error' ? (
          <FormMessage tone="danger">{t(`errors.${state.code}` as never)}</FormMessage>
        ) : null}
        <div className="md:w-48">
          <SubmitButton>{t('saveOutcome')}</SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function ContactForm({
  action,
  defaults,
  submitLabel,
}: {
  action: BoundAction;
  defaults: {
    fullName: string;
    email: string | null;
    phone: string | null;
    jobTitle: string | null;
    role: string;
  } | null;
  submitLabel: string;
}) {
  const t = useTranslations('commercial.deal.contacts');
  const [state, formAction] = useActionState(action, { status: 'idle' });
  const prefix = defaults ? 'edit' : 'new';

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-contact-name`}>{t('fullName')}</Label>
        <Input
          id={`${prefix}-contact-name`}
          name="fullName"
          required
          defaultValue={defaults?.fullName ?? ''}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-contact-email`}>{t('email')}</Label>
        <Input
          id={`${prefix}-contact-email`}
          name="email"
          type="email"
          defaultValue={defaults?.email ?? ''}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-contact-phone`}>{t('phone')}</Label>
        <Input id={`${prefix}-contact-phone`} name="phone" defaultValue={defaults?.phone ?? ''} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-contact-title`}>{t('jobTitle')}</Label>
        <Input
          id={`${prefix}-contact-title`}
          name="jobTitle"
          defaultValue={defaults?.jobTitle ?? ''}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-contact-role`}>{t('role')}</Label>
        <select
          id={`${prefix}-contact-role`}
          name="role"
          defaultValue={defaults?.role ?? 'decision_maker'}
          className={FIELD}
        >
          <option value="decision_maker">{t('roles.decision_maker')}</option>
          <option value="operational">{t('roles.operational')}</option>
          <option value="client_finance">{t('roles.client_finance')}</option>
        </select>
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        {state.status === 'error' ? (
          <FormMessage tone="danger">{t(`errors.${state.code}` as never)}</FormMessage>
        ) : null}
        <div className="md:w-48">
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function CopyMessageButton({ message }: { message: string }) {
  const t = useTranslations('commercial.deal.followUps');
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(message);
        setCopied(true);
      }}
    >
      {copied ? t('copied') : t('copy')}
    </Button>
  );
}
