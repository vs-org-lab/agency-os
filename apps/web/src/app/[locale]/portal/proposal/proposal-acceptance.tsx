'use client';

import { useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { currencyFormatOptions } from '@agency-os/i18n';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { useRouter } from '@/i18n/navigation';
import type { AcceptProposalInput, PortalProposal } from '@/modules/contracts/server';
import type { AcceptActionResult, ChangesActionResult } from './actions';

export type AcceptanceActions = {
  accept(input: AcceptProposalInput): Promise<AcceptActionResult>;
  requestChanges(proposalId: string, message: string): Promise<ChangesActionResult>;
};

const ACCEPT_ERRORS = ['choose', 'invalid_input', 'expired', 'invalid_state', 'not_found'] as const;

type AcceptError = (typeof ACCEPT_ERRORS)[number];

function acceptError(code: string): AcceptError {
  return (ACCEPT_ERRORS as readonly string[]).includes(code) ? (code as AcceptError) : 'not_found';
}

const DETAIL_FIELDS = [
  { name: 'legalName', autoComplete: 'organization' },
  { name: 'taxId', autoComplete: 'off' },
  { name: 'address', autoComplete: 'street-address' },
  { name: 'signerName', autoComplete: 'name' },
  { name: 'signerRole', autoComplete: 'organization-title' },
] as const;

type DetailField = (typeof DETAIL_FIELDS)[number]['name'];

export function ProposalAcceptance({
  proposal,
  actions,
}: {
  proposal: PortalProposal;
  actions: AcceptanceActions;
}) {
  const t = useTranslations('portal.proposal');
  const format = useFormatter();
  const router = useRouter();
  const [optionId, setOptionId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<DetailField, string>>({
    legalName: '',
    taxId: '',
    address: '',
    signerName: '',
    signerRole: '',
  });
  const [error, setError] = useState<AcceptError | null>(null);
  const [message, setMessage] = useState('');
  const [changes, setChanges] = useState<'idle' | 'sent' | 'failed'>('idle');
  const [pending, startTransition] = useTransition();
  const money = (amount: string) =>
    format.number(Number(amount), currencyFormatOptions(proposal.currency));
  const validUntil = format.dateTime(new Date(`${proposal.validUntil}T12:00:00Z`), {
    dateStyle: 'long',
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="text-body text-text-secondary">
          {t('from', { entity: proposal.entityName })}
        </p>
        <p className="text-body-sm text-text-secondary">
          {proposal.expired
            ? t('expired', { date: validUntil })
            : t('validUntil', { date: validUntil })}
        </p>
      </header>

      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!optionId) {
            setError('choose');
            return;
          }
          startTransition(async () => {
            const result = await actions
              .accept({
                proposalId: proposal.id,
                optionId,
                company: {
                  legalName: details.legalName,
                  taxId: details.taxId,
                  address: details.address,
                },
                signer: { name: details.signerName, role: details.signerRole },
              })
              .catch(() => ({ ok: false, code: 'not_found' }) as const);
            if (!result.ok) {
              setError(acceptError(result.code));
              return;
            }
            router.push(`/portal/contracts/${result.contractId}`);
          });
        }}
      >
        <fieldset className="flex flex-col gap-3">
          <legend className="pb-2 text-title-sm text-text">{t('choose')}</legend>
          <p className="text-body-sm text-text-secondary">{t('intro')}</p>
          <div className="grid gap-3 md:grid-cols-3">
            {proposal.options.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer flex-col gap-2 rounded-lg border border-border bg-surface p-4 has-[:checked]:border-2 has-[:checked]:border-text"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="option"
                    value={option.id}
                    disabled={proposal.expired}
                    checked={optionId === option.id}
                    onChange={() => {
                      setOptionId(option.id);
                      setError(null);
                    }}
                    className="size-4 accent-current"
                  />
                  <span className="text-body font-medium text-text">{option.name}</span>
                </span>
                <span className="text-title-sm text-text tabular-nums">
                  {money(option.oneOffAmount)}
                </span>
                {option.retainerMonthly && option.retainerMonths ? (
                  <span className="text-body-sm text-text-secondary">
                    {t('retainer', {
                      amount: money(option.retainerMonthly),
                      months: option.retainerMonths,
                    })}
                  </span>
                ) : null}
                {option.summary ? (
                  <span className="text-body-sm text-text-secondary">{option.summary}</span>
                ) : null}
                <span className="text-label text-text">{t('scope')}</span>
                <ul className="list-disc pl-5 text-body-sm text-text-secondary">
                  {option.scope.map((line, index) => (
                    <li key={index}>{line.text}</li>
                  ))}
                </ul>
                <span className="text-label text-text">{t('payments')}</span>
                <ul className="text-body-sm text-text-secondary">
                  {option.paymentPlan.map((step, index) => (
                    <li key={index}>
                      {t('payment', { label: step.label, percent: step.percent })}
                    </li>
                  ))}
                </ul>
              </label>
            ))}
          </div>
          {proposal.guarantee ? (
            <p className="text-body-sm text-text-secondary">
              <span className="text-label text-text">{t('guarantee')}</span> {proposal.guarantee}
            </p>
          ) : null}
        </fieldset>

        {proposal.expired ? null : (
          <fieldset className="flex flex-col gap-3">
            <legend className="pb-2 text-title-sm text-text">{t('details')}</legend>
            <p className="text-body-sm text-text-secondary">{t('detailsHint')}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {DETAIL_FIELDS.map((field) => (
                <div
                  key={field.name}
                  className={
                    field.name === 'address'
                      ? 'flex flex-col gap-1 md:col-span-2'
                      : 'flex flex-col gap-1'
                  }
                >
                  <Label htmlFor={`proposal-${field.name}`}>{t(`fields.${field.name}`)}</Label>
                  <Input
                    id={`proposal-${field.name}`}
                    required
                    autoComplete={field.autoComplete}
                    maxLength={field.name === 'address' ? 500 : 200}
                    value={details[field.name]}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDetails((current) => ({ ...current, [field.name]: value }));
                      setError(null);
                    }}
                  />
                </div>
              ))}
            </div>
            {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
            <div className="md:w-96">
              <Button type="submit" disabled={pending} className="w-full">
                {t('accept')}
              </Button>
            </div>
          </fieldset>
        )}
      </form>

      {proposal.expired ? null : (
        <form
          className="flex flex-col gap-2 border-t border-border pt-6"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await actions
                .requestChanges(proposal.id, message)
                .catch(() => ({ ok: false, code: 'not_found' }) as const);
              setChanges(result.ok ? 'sent' : 'failed');
              if (result.ok) setMessage('');
            });
          }}
        >
          <h2 className="text-title-sm text-text">{t('changes')}</h2>
          <p className="text-body-sm text-text-secondary">{t('changesHint')}</p>
          <Label htmlFor="proposal-changes">{t('changesMessage')}</Label>
          <Textarea
            id="proposal-changes"
            rows={3}
            required
            maxLength={2000}
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              setChanges('idle');
            }}
          />
          {changes === 'sent' ? <FormMessage tone="success">{t('changesSent')}</FormMessage> : null}
          {changes === 'failed' ? (
            <FormMessage tone="danger">{t('errors.not_found')}</FormMessage>
          ) : null}
          <div>
            <Button type="submit" variant="outline" disabled={pending}>
              {t('sendChanges')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
