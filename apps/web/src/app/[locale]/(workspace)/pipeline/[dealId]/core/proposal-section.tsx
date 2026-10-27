'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { currencies, currencyFormatOptions, type Currency, type Locale } from '@agency-os/i18n';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { Checkbox } from '@agency-os/ui/components/checkbox';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { MAX_PAYMENT_STEPS, validatePaymentPlan } from '@/modules/contracts';
import type {
  ProposalDraftInput,
  ProposalOptionInput,
  ProposalView,
  ProposalWorkspace,
} from '@/modules/contracts/server';
import type { ContractActionResult, SaveProposalResult } from './contract-actions';
import { ModuleBuilder, PaymentPresets } from './module-builder';

export type ProposalActions = {
  save(input: ProposalDraftInput): Promise<SaveProposalResult>;
  send(proposalId: string, dealId: string): Promise<ContractActionResult>;
  withdraw(proposalId: string, dealId: string): Promise<ContractActionResult>;
};

const FIELD = 'h-11 rounded-md border border-border bg-surface px-3 text-body text-text md:h-9';
const MAX_OPTIONS = 3;
const LOCALES: Locale[] = ['pt-PT', 'en'];
const DEFAULT_NAMES = ['first', 'second', 'third'] as const;

const PROPOSAL_ERRORS = [
  'payments',
  'invalid_input',
  'locked',
  'stage',
  'portal_access',
  'invalid_state',
  'not_found',
] as const;

type ProposalError = (typeof PROPOSAL_ERRORS)[number];

function proposalError(code: string): ProposalError {
  return (PROPOSAL_ERRORS as readonly string[]).includes(code)
    ? (code as ProposalError)
    : 'not_found';
}

type Message = { tone: 'danger'; code: ProposalError } | { tone: 'success'; code: 'saved' } | null;

function inThirtyDays(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

function blankOption(name: string, signature: string, delivery: string): ProposalOptionInput {
  return {
    name,
    summary: '',
    scope: [{ text: '', findingId: null }],
    oneOffAmount: '',
    paymentPlan: [
      { label: signature, percent: 50 },
      { label: delivery, percent: 50 },
    ],
    retainerMonthly: null,
    retainerMonths: null,
    modules: [],
  };
}

function editableOptions(proposal: ProposalView | null): ProposalOptionInput[] | null {
  if (!proposal) return null;
  return proposal.options.map((option) => ({
    name: option.name,
    summary: option.summary,
    scope: option.scope,
    oneOffAmount: option.oneOffAmount,
    paymentPlan: option.paymentPlan,
    retainerMonthly: option.retainerMonthly,
    retainerMonths: option.retainerMonths,
    modules: option.modules,
  }));
}

export function ProposalSection({
  workspace,
  founder,
  actions,
}: {
  workspace: ProposalWorkspace;
  founder: boolean;
  actions: ProposalActions;
}) {
  const t = useTranslations('contracts.proposal');
  const { proposal } = workspace;
  const locked = proposal !== null && proposal.status !== 'draft';
  const expired =
    proposal?.status === 'sent' && proposal.validUntil < new Date().toISOString().slice(0, 10);

  return (
    <section
      aria-labelledby="proposal-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="proposal-title" className="text-title-sm text-text">
            {t('title')}
          </h2>
          {proposal ? (
            <Badge variant={proposal.status === 'accepted' ? 'default' : 'secondary'}>
              {expired ? t('status.expired') : t(`status.${proposal.status}`)}
            </Badge>
          ) : null}
        </div>
        <p className="text-body-sm text-text-secondary">{t('description')}</p>
        {expired ? <p className="text-body-sm text-warning">{t('expiredHint')}</p> : null}
      </header>
      {proposal && proposal.requests.length > 0 ? (
        <ChangeRequests requests={proposal.requests} />
      ) : null}
      {locked && proposal ? (
        <ProposalSummary
          proposal={proposal}
          dealId={workspace.dealId}
          founder={founder}
          withdraw={actions.withdraw}
        />
      ) : (
        <ProposalEditor workspace={workspace} founder={founder} actions={actions} />
      )}
    </section>
  );
}

function ProposalEditor({
  workspace,
  founder,
  actions,
}: {
  workspace: ProposalWorkspace;
  founder: boolean;
  actions: ProposalActions;
}) {
  const t = useTranslations('contracts.proposal');
  const router = useRouter();
  const { proposal, entities, findings } = workspace;
  const defaultEntity = entities.find((entity) => entity.isDefault) ?? entities[0];
  const [entityId, setEntityId] = useState(proposal?.legalEntityId ?? defaultEntity?.id ?? '');
  const [currency, setCurrency] = useState<Currency>(
    proposal?.currency ?? workspace.defaults.currency,
  );
  const [locale, setLocale] = useState<Locale>(proposal?.locale ?? workspace.defaults.locale);
  const [validUntil, setValidUntil] = useState(proposal?.validUntil ?? inThirtyDays());
  const [guarantee, setGuarantee] = useState(proposal?.guarantee ?? '');
  const [options, setOptions] = useState<ProposalOptionInput[]>(
    () =>
      editableOptions(proposal) ??
      DEFAULT_NAMES.map((key) =>
        blankOption(
          t(`defaultNames.${key}`),
          t('defaultPayments.signature'),
          t('defaultPayments.delivery'),
        ),
      ),
  );
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();

  const update = (index: number, change: (option: ProposalOptionInput) => ProposalOptionInput) => {
    setOptions((current) => current.map((option, at) => (at === index ? change(option) : option)));
    setMessage(null);
  };

  const sendBlocker =
    entities.length === 0
      ? 'entity'
      : !founder
        ? 'founder'
        : workspace.stage !== '1.6'
          ? 'stage'
          : !workspace.portalAccess
            ? 'portal'
            : null;

  const input = (): ProposalDraftInput => ({
    dealId: workspace.dealId,
    legalEntityId: entityId,
    currency,
    locale,
    validUntil,
    guarantee,
    options: options.map((option) => ({
      ...option,
      scope: option.scope.filter((line) => line.text.trim() !== ''),
    })),
  });

  const save = (thenSend: boolean) =>
    startTransition(async () => {
      if (!options.every((option) => validatePaymentPlan(option.paymentPlan))) {
        setMessage({ tone: 'danger', code: 'payments' });
        return;
      }
      const saved = await actions
        .save(input())
        .catch(() => ({ ok: false, code: 'not_found' }) as const);
      if (!saved.ok) {
        setMessage({ tone: 'danger', code: proposalError(saved.code) });
        return;
      }
      if (thenSend) {
        const sent = await actions
          .send(saved.proposalId, workspace.dealId)
          .catch(() => ({ ok: false, code: 'not_found' }) as const);
        if (!sent.ok) {
          setMessage({ tone: 'danger', code: proposalError(sent.code) });
          return;
        }
      } else {
        setMessage({ tone: 'success', code: 'saved' });
      }
      router.refresh();
    });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        save(false);
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="proposal-entity">{t('entity')}</Label>
          <select
            id="proposal-entity"
            value={entityId}
            onChange={(event) => setEntityId(event.target.value)}
            className={FIELD}
          >
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.legalName}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="proposal-valid-until">{t('validUntil')}</Label>
          <Input
            id="proposal-valid-until"
            type="date"
            required
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="proposal-currency">{t('currency')}</Label>
          <select
            id="proposal-currency"
            value={currency}
            onChange={(event) =>
              setCurrency(currencies.find((code) => code === event.target.value) ?? 'EUR')
            }
            className={FIELD}
          >
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="proposal-locale">{t('locale')}</Label>
          <select
            id="proposal-locale"
            value={locale}
            onChange={(event) => setLocale(event.target.value === 'en' ? 'en' : 'pt-PT')}
            className={FIELD}
          >
            {LOCALES.map((code) => (
              <option key={code} value={code}>
                {t(`languages.${code}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 md:col-span-2">
          <Label htmlFor="proposal-guarantee">{t('guarantee')}</Label>
          <Textarea
            id="proposal-guarantee"
            rows={2}
            maxLength={2000}
            value={guarantee}
            onChange={(event) => setGuarantee(event.target.value)}
          />
        </div>
      </div>

      <ol className="flex flex-col gap-4">
        {options.map((option, index) => (
          <li key={index}>
            <OptionEditor
              index={index}
              option={option}
              findings={findings}
              locale={locale}
              currency={currency}
              canRemove={options.length > 1}
              onChange={(change) => update(index, change)}
              onRemove={() => setOptions((current) => current.filter((_, at) => at !== index))}
            />
          </li>
        ))}
      </ol>
      {options.length < MAX_OPTIONS ? (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setOptions((current) => [
                ...current,
                blankOption(
                  t(`defaultNames.${DEFAULT_NAMES[current.length] ?? 'third'}`),
                  t('defaultPayments.signature'),
                  t('defaultPayments.delivery'),
                ),
              ])
            }
          >
            {t('addOption')}
          </Button>
        </div>
      ) : null}

      {message ? (
        <FormMessage tone={message.tone}>
          {message.tone === 'success' ? t('saved') : t(`errors.${message.code}`)}
        </FormMessage>
      ) : null}
      {sendBlocker ? (
        <p className="text-body-sm text-text-secondary">{t(`hints.${sendBlocker}`)}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" disabled={pending || entities.length === 0}>
          {t('save')}
        </Button>
        {founder ? (
          <Button
            type="button"
            disabled={pending || sendBlocker !== null}
            onClick={() => save(true)}
          >
            {t('send')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function OptionEditor({
  index,
  option,
  findings,
  locale,
  currency,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  option: ProposalOptionInput;
  findings: ProposalWorkspace['findings'];
  locale: Locale;
  currency: Currency;
  canRemove: boolean;
  onChange: (change: (option: ProposalOptionInput) => ProposalOptionInput) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('contracts.proposal');
  const prefix = `proposal-option-${index}`;
  const total = option.paymentPlan.reduce((sum, step) => sum + step.percent, 0);
  const retainer = option.retainerMonthly !== null;

  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-border p-4">
      <legend className="px-1 text-label text-text">{t('option', { position: index + 1 })}</legend>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${prefix}-name`}>{t('name')}</Label>
          <Input
            id={`${prefix}-name`}
            required
            maxLength={120}
            value={option.name}
            onChange={(event) => {
              const name = event.target.value;
              onChange((current) => ({ ...current, name }));
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${prefix}-amount`}>{t('amount')}</Label>
          <Input
            id={`${prefix}-amount`}
            inputMode="decimal"
            required
            value={option.oneOffAmount}
            onChange={(event) => {
              const oneOffAmount = event.target.value.replace(',', '.');
              onChange((current) => ({ ...current, oneOffAmount }));
            }}
          />
        </div>
        <div className="flex flex-col gap-1 md:col-span-2">
          <Label htmlFor={`${prefix}-summary`}>{t('summary')}</Label>
          <Textarea
            id={`${prefix}-summary`}
            rows={2}
            maxLength={2000}
            value={option.summary}
            onChange={(event) => {
              const summary = event.target.value;
              onChange((current) => ({ ...current, summary }));
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-label text-text">{t('scope')}</span>
        {option.scope.map((line, lineIndex) => (
          <div key={lineIndex} className="flex items-center gap-2">
            <Input
              aria-label={t('scopeLine', { position: lineIndex + 1 })}
              maxLength={300}
              value={line.text}
              onChange={(event) => {
                const text = event.target.value;
                onChange((current) => ({
                  ...current,
                  scope: current.scope.map((entry, at) =>
                    at === lineIndex ? { ...entry, text } : entry,
                  ),
                }));
              }}
            />
            {option.scope.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t('removeLine', { position: lineIndex + 1 })}
                onClick={() =>
                  onChange((current) => ({
                    ...current,
                    scope: current.scope.filter((_, at) => at !== lineIndex),
                  }))
                }
              >
                <X aria-hidden className="size-4" />
              </Button>
            ) : null}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onChange((current) => ({
                ...current,
                scope: [...current.scope, { text: '', findingId: null }],
              }))
            }
          >
            {t('addLine')}
          </Button>
          {findings.length > 0 ? (
            <select
              aria-label={t('addFinding')}
              value=""
              className={FIELD}
              onChange={(event) => {
                const finding = findings.find((entry) => entry.id === event.target.value);
                if (!finding) return;
                onChange((current) => {
                  const line = { text: finding.title, findingId: finding.id };
                  const last = current.scope.at(-1);
                  return {
                    ...current,
                    scope:
                      last && last.text.trim() === ''
                        ? [...current.scope.slice(0, -1), line]
                        : [...current.scope, line],
                  };
                });
              }}
            >
              <option value="">{t('addFindingPlaceholder')}</option>
              {findings.map((finding) => (
                <option key={finding.id} value={finding.id}>
                  {finding.title}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      <ModuleBuilder
        prefix={prefix}
        modules={option.modules ?? []}
        locale={locale}
        currency={currency}
        onChange={(modules) => onChange((current) => ({ ...current, modules }))}
      />

      <div className="flex flex-col gap-2">
        <span className="text-label text-text">{t('payments')}</span>
        <PaymentPresets locale={locale} onApply={onChange} />
        {option.paymentPlan.map((step, stepIndex) => (
          <div key={stepIndex} className="flex items-center gap-2">
            <Input
              aria-label={t('paymentLabel', { position: stepIndex + 1 })}
              maxLength={80}
              value={step.label}
              onChange={(event) => {
                const label = event.target.value;
                onChange((current) => ({
                  ...current,
                  paymentPlan: current.paymentPlan.map((entry, at) =>
                    at === stepIndex ? { ...entry, label } : entry,
                  ),
                }));
              }}
            />
            <Input
              aria-label={t('paymentPercent', { position: stepIndex + 1 })}
              type="number"
              min={1}
              max={100}
              className="w-24"
              value={String(step.percent)}
              onChange={(event) => {
                const percent = Number(event.target.value);
                onChange((current) => ({
                  ...current,
                  paymentPlan: current.paymentPlan.map((entry, at) =>
                    at === stepIndex ? { ...entry, percent } : entry,
                  ),
                }));
              }}
            />
            {option.paymentPlan.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t('removePayment', { position: stepIndex + 1 })}
                onClick={() =>
                  onChange((current) => ({
                    ...current,
                    paymentPlan: current.paymentPlan.filter((_, at) => at !== stepIndex),
                  }))
                }
              >
                <X aria-hidden className="size-4" />
              </Button>
            ) : null}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          {option.paymentPlan.length < MAX_PAYMENT_STEPS ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onChange((current) => ({
                  ...current,
                  paymentPlan: [...current.paymentPlan, { label: '', percent: 0 }],
                }))
              }
            >
              {t('addPayment')}
            </Button>
          ) : null}
          <span
            className={total === 100 ? 'text-body-sm text-success' : 'text-body-sm text-danger'}
          >
            {t('paymentsTotal', { total })}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Checkbox
            id={`${prefix}-retainer`}
            checked={retainer}
            onCheckedChange={(checked) =>
              onChange((current) => ({
                ...current,
                retainerMonthly: checked === true ? '' : null,
                retainerMonths: checked === true ? 12 : null,
              }))
            }
          />
          <Label htmlFor={`${prefix}-retainer`} className="text-body-sm text-text">
            {t('retainerToggle')}
          </Label>
        </div>
        {retainer ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${prefix}-retainer-monthly`}>{t('retainerMonthly')}</Label>
              <Input
                id={`${prefix}-retainer-monthly`}
                inputMode="decimal"
                required
                value={option.retainerMonthly ?? ''}
                onChange={(event) => {
                  const retainerMonthly = event.target.value.replace(',', '.');
                  onChange((current) => ({ ...current, retainerMonthly }));
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${prefix}-retainer-months`}>{t('retainerMonths')}</Label>
              <Input
                id={`${prefix}-retainer-months`}
                type="number"
                min={1}
                max={36}
                required
                value={String(option.retainerMonths ?? 12)}
                onChange={(event) => {
                  const retainerMonths = Number(event.target.value);
                  onChange((current) => ({ ...current, retainerMonths }));
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {canRemove ? (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            {t('removeOption', { position: index + 1 })}
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

function ProposalSummary({
  proposal,
  dealId,
  founder,
  withdraw,
}: {
  proposal: ProposalView;
  dealId: string;
  founder: boolean;
  withdraw: ProposalActions['withdraw'];
}) {
  const t = useTranslations('contracts.proposal');
  const format = useFormatter();
  const router = useRouter();
  const [error, setError] = useState<ProposalError | null>(null);
  const [pending, startTransition] = useTransition();
  const money = (amount: string) =>
    format.number(Number(amount), currencyFormatOptions(proposal.currency));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-text-secondary">
        {proposal.acceptedAt
          ? t('acceptedOn', { date: format.dateTime(proposal.acceptedAt, { dateStyle: 'medium' }) })
          : proposal.sentAt
            ? t('sentOn', { date: format.dateTime(proposal.sentAt, { dateStyle: 'medium' }) })
            : null}{' '}
        {t('validUntilOn', {
          date: format.dateTime(new Date(`${proposal.validUntil}T12:00:00Z`), {
            dateStyle: 'medium',
          }),
        })}
      </p>
      <ul className="grid gap-3 md:grid-cols-3">
        {proposal.options.map((option) => (
          <li
            key={option.id}
            className={
              option.id === proposal.acceptedOptionId
                ? 'flex flex-col gap-2 rounded-md border-2 border-success p-3'
                : 'flex flex-col gap-2 rounded-md border border-border p-3'
            }
          >
            <span className="text-body font-medium text-text">{option.name}</span>
            {option.id === proposal.acceptedOptionId ? <Badge>{t('chosen')}</Badge> : null}
            <span className="text-title-sm text-text tabular-nums">
              {money(option.oneOffAmount)}
            </span>
            {option.retainerMonthly && option.retainerMonths ? (
              <span className="text-body-sm text-text-secondary">
                {t('retainerSummary', {
                  amount: money(option.retainerMonthly),
                  months: option.retainerMonths,
                })}
              </span>
            ) : null}
            <ul className="list-disc pl-5 text-body-sm text-text-secondary">
              {option.scope.map((line, lineIndex) => (
                <li key={lineIndex}>{line.text}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
      {founder && proposal.status === 'sent' ? (
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await withdraw(proposal.id, dealId).catch(
                  () => ({ ok: false, code: 'not_found' }) as const,
                );
                if (!result.ok) return setError(proposalError(result.code));
                router.refresh();
              })
            }
          >
            {t('withdraw')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ChangeRequests({ requests }: { requests: ProposalView['requests'] }) {
  const t = useTranslations('contracts.proposal');
  const format = useFormatter();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-label text-text">{t('requests')}</span>
      <ul className="flex flex-col gap-2">
        {requests.map((request) => (
          <li key={request.id} className="flex flex-col gap-1 rounded-md bg-surface-muted p-3">
            <span className="text-caption text-text-tertiary">
              {format.dateTime(request.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
            <p className="text-body-sm text-text">{request.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
