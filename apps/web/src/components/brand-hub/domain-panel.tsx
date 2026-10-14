'use client';

import { useId, useState, useTransition } from 'react';
import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import type { HubDomainState, HubDomainView } from '@/modules/brand-hub';

export type DomainActionResult = { ok: true } | { ok: false; code: string; message?: string };

export type DomainActions = {
  save: (hubId: string, hostname: string) => Promise<DomainActionResult>;
  verify: (hubId: string) => Promise<DomainActionResult>;
  connect: (hubId: string) => Promise<DomainActionResult>;
  remove: (hubId: string) => Promise<DomainActionResult>;
};

const ERRORS = [
  'invalid_input',
  'missing',
  'mismatch',
  'rate_limited',
  'invalid_state',
  'not_approved',
  'provider_error',
  'unavailable',
  'not_found',
] as const;

type DomainError = (typeof ERRORS)[number];

const domainError = (code: string): DomainError =>
  ERRORS.find((known) => known === code) ?? 'not_found';

type Outcome =
  | { tone: 'success'; key: 'saved' | 'verified' | 'connected' | 'removed' | 'copied' }
  | { tone: 'danger'; key: DomainError; message?: string };

function DnsRecord({
  type,
  name,
  value,
  onCopied,
}: {
  type: 'TXT' | 'CNAME';
  name: string;
  value: string;
  onCopied: () => void;
}) {
  const t = useTranslations('brandHub.domain');
  const copy = async () => {
    const copied = await navigator.clipboard?.writeText(value).then(
      () => true,
      () => false,
    );
    if (copied) onCopied();
  };
  return (
    <div className="grid grid-cols-[4rem_1fr] gap-x-2 gap-y-1 rounded border border-border p-2 text-caption">
      <dt className="text-text-secondary">{t('recordType')}</dt>
      <dd className="font-mono text-text">{type}</dd>
      <dt className="text-text-secondary">{t('recordName')}</dt>
      <dd className="min-w-0 break-all font-mono text-text">{name}</dd>
      <dt className="text-text-secondary">{t('recordValue')}</dt>
      <dd className="flex min-w-0 items-center gap-1">
        <code className="min-w-0 break-all font-mono text-text">{value}</code>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('copyValue', { type })}
          onClick={copy}
        >
          <Copy aria-hidden="true" />
        </Button>
      </dd>
    </div>
  );
}

function DomainStatus({ domain, approved }: { domain: HubDomainView; approved: boolean }) {
  const t = useTranslations('brandHub.domain');
  return (
    <>
      <p className="text-body-sm text-text">
        {t('statusLabel', { status: t(`status.${domain.status}`) })}
      </p>
      {domain.status === 'verified' && !approved ? (
        <FormMessage tone="info">{t('approvalNeeded')}</FormMessage>
      ) : null}
      {domain.status === 'connected' ? (
        domain.configured ? (
          <FormMessage tone="success">{t('live', { host: domain.hostname })}</FormMessage>
        ) : (
          <FormMessage tone="info">{t('waitingDns')}</FormMessage>
        )
      ) : null}
    </>
  );
}

/**
 * RF-095 and SEC-43: the client's own address for the published site, proven by a TXT record and
 * connected only once the client has approved the hub (RN-81).
 */
export function DomainPanel({
  hubId,
  approved,
  state,
  actions,
}: {
  hubId: string;
  approved: boolean;
  state: HubDomainState;
  actions: DomainActions;
}) {
  const t = useTranslations('brandHub.domain');
  const id = useId();
  const domain = state.domain;
  const [hostname, setHostname] = useState(domain?.hostname ?? '');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (
    action: () => Promise<DomainActionResult>,
    success: 'saved' | 'verified' | 'connected' | 'removed',
  ) =>
    startTransition(async () => {
      const result = await action().catch(
        () => ({ ok: false, code: 'not_found' }) as DomainActionResult,
      );
      if (result.ok) {
        setOutcome({ tone: 'success', key: success });
        return;
      }
      setOutcome({
        tone: 'danger',
        key: domainError(result.code),
        message: result.message,
      });
    });

  if (!state.available) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="text-body-sm font-medium text-text">{t('title')}</h3>
        <p className="text-body-sm text-text-secondary">{t('unavailable')}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby={`${id}-title`}>
      <div className="flex flex-col gap-1">
        <h3 id={`${id}-title`} className="text-body-sm font-medium text-text">
          {t('title')}
        </h3>
        <p className="text-caption text-text-secondary">{t('intro')}</p>
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => actions.save(hubId, hostname), 'saved');
        }}
      >
        <Label htmlFor={`${id}-hostname`}>{t('hostname')}</Label>
        <Input
          id={`${id}-hostname`}
          value={hostname}
          maxLength={253}
          inputMode="url"
          autoComplete="off"
          aria-describedby={`${id}-hostname-hint`}
          onChange={(event) => setHostname(event.target.value)}
          className="font-mono"
        />
        <p id={`${id}-hostname-hint`} className="text-caption text-text-secondary">
          {t('hostnameHint')}
        </p>
        <Button type="submit" size="sm" variant="outline" disabled={pending} className="self-start">
          {t('save')}
        </Button>
      </form>
      {domain ? (
        <div className="flex flex-col gap-3">
          <DomainStatus domain={domain} approved={approved} />
          {domain.status !== 'connected' || !domain.configured ? (
            <div className="flex flex-col gap-2">
              <p className="text-caption font-medium text-text">{t('records')}</p>
              <dl className="flex flex-col gap-2">
                {domain.status === 'pending' ? (
                  <DnsRecord
                    type="TXT"
                    name={domain.verificationName}
                    value={domain.verificationCode}
                    onCopied={() => setOutcome({ tone: 'success', key: 'copied' })}
                  />
                ) : null}
                <DnsRecord
                  type="CNAME"
                  name={domain.hostname}
                  value={domain.cnameTarget}
                  onCopied={() => setOutcome({ tone: 'success', key: 'copied' })}
                />
              </dl>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {domain.status === 'pending' ? (
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => run(() => actions.verify(hubId), 'verified')}
              >
                {t('verify')}
              </Button>
            ) : null}
            {domain.status === 'verified' ? (
              <Button
                type="button"
                size="sm"
                disabled={pending || !approved}
                onClick={() => run(() => actions.connect(hubId), 'connected')}
              >
                {t('connect')}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => actions.remove(hubId), 'removed')}
            >
              {t('remove')}
            </Button>
          </div>
        </div>
      ) : null}
      {outcome?.tone === 'success' ? (
        <FormMessage tone="success">{t(outcome.key)}</FormMessage>
      ) : outcome ? (
        <FormMessage tone="danger">
          {t(`errors.${outcome.key}`, { message: outcome.message ?? '' })}
        </FormMessage>
      ) : null}
    </section>
  );
}
