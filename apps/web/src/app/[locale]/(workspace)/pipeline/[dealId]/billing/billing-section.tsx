'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { formatMoney, type Locale } from '@agency-os/i18n';
import {
  billingError,
  type BillingActionResult,
  type BillingError,
} from '@/components/billing/billing-forms';
import {
  RequestBlock,
  type RequestActions,
  type RequestDoneKey,
} from '@/components/billing/request-block';
import { FormMessage } from '@/components/forms/form-message';
import type { ApprovalPhaseView, DealBilling, MilestoneView } from '@/modules/billing';
import { toMinorUnits } from '@/modules/contracts';

export type { BillingActionResult } from '@/components/billing/billing-forms';

export type BillingActions = RequestActions & {
  createPlan(dealId: string): Promise<BillingActionResult>;
  request(milestoneId: string): Promise<BillingActionResult>;
  linkPhase(milestoneId: string, phaseId: string | null): Promise<BillingActionResult>;
};

type DoneKey = RequestDoneKey | 'createPlan' | 'request' | 'linkPhase';

type Feedback = { tone: 'success'; key: DoneKey } | { tone: 'danger'; error: BillingError };

function releaseText(
  t: ReturnType<typeof useTranslations<'billing.deal'>>,
  milestone: MilestoneView,
): string {
  if (milestone.trigger === 'signature') return t('releases.signature');
  if (milestone.trigger === 'delivery') return t('releases.delivery');
  return milestone.phase
    ? t('releases.phase', { phase: milestone.phase.name })
    : t('releases.manual');
}

/** Spec 2D.2, decision 2: the founder or finance picks the approval phase of a pending milestone. */
function PhasePicker({
  milestone,
  phases,
  disabled,
  onChange,
}: {
  milestone: MilestoneView;
  phases: ApprovalPhaseView[];
  disabled: boolean;
  onChange: (phaseId: string | null) => void;
}) {
  const t = useTranslations('billing.deal');
  const id = useId();
  const options = phases.filter((phase) => !phase.done || phase.id === milestone.phase?.id);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        {t('phaseLabel', { label: milestone.label })}
      </label>
      <select
        id={id}
        className="h-11 max-w-72 rounded-md border border-border bg-surface px-3 text-body text-text md:h-9"
        value={milestone.phase?.id ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      >
        <option value="">{t('noPhase')}</option>
        {options.map((phase) => (
          <option key={phase.id} value={phase.id}>
            {phase.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function MilestoneCard({
  milestone,
  phases,
  writable,
  actions,
  onFeedback,
}: {
  milestone: MilestoneView;
  phases: ApprovalPhaseView[];
  writable: boolean;
  actions: BillingActions;
  onFeedback: (feedback: Feedback) => void;
}) {
  const t = useTranslations('billing.deal');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const linkPhase = (phaseId: string | null) =>
    startTransition(async () => {
      const result = await actions
        .linkPhase(milestone.id, phaseId)
        .catch(() => ({ ok: false, code: 'not_found' }) as const);
      onFeedback(
        result.ok
          ? { tone: 'success', key: 'linkPhase' }
          : { tone: 'danger', error: billingError(result.code) },
      );
      if (result.ok) router.refresh();
    });

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-title-sm text-text">
          {t('milestone', {
            position: milestone.position,
            label: milestone.label,
            percent: milestone.percent,
          })}
        </h3>
        <span className="tabular-nums text-body text-text">
          {formatMoney(toMinorUnits(milestone.amount), milestone.currency, locale)}
        </span>
        <Badge variant={milestone.status === 'paid' ? 'secondary' : 'outline'}>
          {t(`milestoneStatus.${milestone.status}`)}
        </Badge>
      </div>
      <p className="text-caption text-text-secondary">{releaseText(t, milestone)}</p>
      {writable && milestone.status === 'pending' && milestone.trigger === 'phase_approval' ? (
        <PhasePicker
          milestone={milestone}
          phases={phases}
          disabled={pending}
          onChange={linkPhase}
        />
      ) : null}
      {milestone.locked ? (
        <p className="text-body-sm text-text-secondary">
          {milestone.trigger === 'delivery'
            ? t('locked.delivery')
            : t('locked.phase', { phase: milestone.phase?.name ?? '' })}
        </p>
      ) : null}
      {milestone.request ? (
        <RequestBlock
          request={milestone.request}
          writable={writable}
          actions={actions}
          onFeedback={onFeedback}
        />
      ) : writable && milestone.status === 'pending' ? (
        <div>
          <Button
            size="sm"
            disabled={pending || milestone.locked}
            onClick={() =>
              startTransition(async () => {
                const result = await actions
                  .request(milestone.id)
                  .catch(() => ({ ok: false, code: 'not_found' }) as const);
                onFeedback(
                  result.ok
                    ? { tone: 'success', key: 'request' }
                    : { tone: 'danger', error: billingError(result.code) },
                );
                if (result.ok) router.refresh();
              })
            }
          >
            {t('actions.request')}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/** S-10 summarised: the deal's milestones, payment requests, payments and legal invoices. */
export function BillingSection({
  dealId,
  billing,
  writable,
  canCreatePlan,
  actions,
}: {
  dealId: string;
  billing: DealBilling | null;
  writable: boolean;
  /** A signed contract exists without a plan, e.g. signed before billing or its event pending. */
  canCreatePlan: boolean;
  actions: BillingActions;
}) {
  const t = useTranslations('billing.deal');
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, startTransition] = useTransition();
  const createPlan = () =>
    startTransition(async () => {
      const result = await actions
        .createPlan(dealId)
        .catch(() => ({ ok: false, code: 'not_found' }) as const);
      setFeedback(
        result.ok
          ? { tone: 'success', key: 'createPlan' }
          : { tone: 'danger', error: billingError(result.code) },
      );
      if (result.ok) router.refresh();
    });

  return (
    <section
      aria-labelledby="billing-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <header className="flex flex-col gap-1">
        <h2 id="billing-title" className="text-title text-text">
          {t('title')}
        </h2>
        <p className="text-body-sm text-text-secondary">{t('nonFiscal')}</p>
      </header>
      <div aria-live="polite">
        {feedback?.tone === 'success' ? (
          <FormMessage tone="success">{t(`done.${feedback.key}`)}</FormMessage>
        ) : null}
        {feedback?.tone === 'danger' ? (
          <FormMessage tone="danger">{t(`errors.${feedback.error}`)}</FormMessage>
        ) : null}
      </div>
      {billing ? (
        <ol className="flex flex-col gap-3">
          {billing.milestones.map((milestone) => (
            <MilestoneCard
              key={milestone.id}
              milestone={milestone}
              phases={billing.approvalPhases}
              writable={writable}
              actions={actions}
              onFeedback={setFeedback}
            />
          ))}
        </ol>
      ) : writable && canCreatePlan ? (
        <div>
          <Button disabled={pending} onClick={createPlan}>
            {t('actions.createPlan')}
          </Button>
        </div>
      ) : (
        <p className="text-body-sm text-text-secondary">{t('empty')}</p>
      )}
    </section>
  );
}
