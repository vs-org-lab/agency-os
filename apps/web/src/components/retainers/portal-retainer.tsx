'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { useRouter } from '@/i18n/navigation';
import type { PortalRetainerView, RetainerExtraRow } from '@/modules/retainers';
import { LimitRings } from './limit-rings';
import {
  decimal,
  retainerError,
  SELECT,
  useQuantity,
  type RetainerError,
  type RetainerResult,
} from './shared';

export type PortalRetainerActions = {
  request: (input: {
    retainerId: string;
    kind: string;
    description: string;
    quantity: string;
  }) => Promise<{ ok: true; outcome: 'task' | 'extra' } | { ok: false; code: string }>;
  decide: (extraRequestId: string, decision: 'approved' | 'declined') => Promise<RetainerResult>;
};

export function RequestForm({
  view,
  request,
  onDone,
}: {
  view: PortalRetainerView;
  request: PortalRetainerActions['request'];
  /** Called after the request was accepted, with how it was handled. */
  onDone?: (outcome: 'task' | 'extra') => void;
}) {
  const t = useTranslations('retainers');
  const id = useId();
  const [kind, setKind] = useState<string>(view.limits[0]?.kind ?? '');
  const [quantity, setQuantity] = useState('1');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState<'task' | 'extra' | RetainerError | null>(null);
  const [pending, startTransition] = useTransition();
  const quantityRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const errorId = `${id}-error`;
  const rejected = message === 'invalid_input';
  const invalidQuantity = rejected && !(Number(decimal(quantity)) > 0);
  const invalidDescription = rejected && !invalidQuantity && description.trim() === '';

  useEffect(() => {
    if (message !== 'invalid_input') return;
    const target = invalidQuantity ? quantityRef : descriptionRef;
    target.current?.focus();
  }, [message]);

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await request({
            retainerId: view.retainer.id,
            kind,
            description: description.trim(),
            quantity: decimal(quantity),
          }).catch(() => ({ ok: false as const, code: 'not_found' }));
          if (result.ok) {
            setDescription('');
            setMessage(result.outcome);
            onDone?.(result.outcome);
          } else setMessage(retainerError(result.code));
        });
      }}
    >
      <h3 className="text-body font-medium text-text">{t('portal.request.title')}</h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-kind`}>{t('portal.request.kind')}</Label>
          <select
            id={`${id}-kind`}
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className={SELECT}
          >
            {view.limits.map((limit) => (
              <option key={limit.kind} value={limit.kind}>
                {t(`kinds.${limit.kind}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-quantity`}>{t('portal.request.quantity')}</Label>
          <Input
            id={`${id}-quantity`}
            ref={quantityRef}
            inputMode="decimal"
            required
            aria-invalid={invalidQuantity ? true : undefined}
            aria-describedby={invalidQuantity ? errorId : undefined}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor={`${id}-description`}>{t('portal.request.description')}</Label>
          <Input
            id={`${id}-description`}
            ref={descriptionRef}
            required
            aria-invalid={invalidDescription ? true : undefined}
            aria-describedby={invalidDescription ? errorId : undefined}
            maxLength={500}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>
      {message === 'task' ? (
        <FormMessage tone="success">{t('portal.request.task')}</FormMessage>
      ) : message === 'extra' ? (
        <FormMessage tone="info">{t('portal.request.extra')}</FormMessage>
      ) : message ? (
        <FormMessage tone="danger" id={errorId}>
          {t(`errors.${message}`)}
        </FormMessage>
      ) : null}
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {t('portal.request.send')}
      </Button>
    </form>
  );
}

function ExtraItem({
  extra,
  decides,
  decide,
}: {
  extra: RetainerExtraRow;
  decides: boolean;
  decide: PortalRetainerActions['decide'];
}) {
  const t = useTranslations('retainers');
  const format = useFormatter();
  const quantity = useQuantity();
  const [message, setMessage] = useState<'approved' | 'declined' | RetainerError | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (decision: 'approved' | 'declined') =>
    startTransition(async () => {
      const result = await decide(extra.id, decision).catch(() => ({
        ok: false as const,
        code: 'not_found',
      }));
      setMessage(result.ok ? decision : retainerError(result.code));
    });

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body-sm font-medium text-text">{extra.description}</span>
        <Badge variant={extra.status === 'approved' ? 'secondary' : 'outline'}>
          {t(`extras.statuses.${extra.status}`)}
        </Badge>
      </div>
      <p className="text-caption text-text-secondary">
        {[
          `${quantity(extra.quantity)} × ${t(`kinds.${extra.kind}`)}`,
          extra.quoteAmount && extra.currency
            ? t('extras.quote', {
                amount: format.number(Number(extra.quoteAmount), {
                  style: 'currency',
                  currency: extra.currency,
                }),
              })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {decides && extra.status === 'quoted' && message === null ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={pending} onClick={() => run('approved')}>
            {t('portal.approve')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run('declined')}
          >
            {t('portal.decline')}
          </Button>
        </div>
      ) : null}
      {message === 'approved' || message === 'declined' ? (
        <FormMessage tone="success">{t(`portal.${message}`)}</FormMessage>
      ) : message ? (
        <FormMessage tone="danger">{t(`errors.${message}`)}</FormMessage>
      ) : null}
    </li>
  );
}

/** P-10: the retainer's month for the client, their requests and the quotes to decide. */
export function PortalRetainer({
  view,
  actions,
}: {
  view: PortalRetainerView;
  actions: PortalRetainerActions;
}) {
  const t = useTranslations('retainers');
  const format = useFormatter();
  const router = useRouter();
  const monthLabel = format.dateTime(new Date(`${view.month}T12:00:00Z`), {
    month: 'long',
    year: 'numeric',
  });
  const refreshAfter =
    <A extends unknown[], R extends { ok: boolean }>(run: (...args: A) => Promise<R>) =>
    async (...args: A) => {
      const result = await run(...args);
      if (result.ok) router.refresh();
      return result;
    };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-label={t('month', { month: monthLabel })}>
        <h2 className="text-title-sm text-text">{t('month', { month: monthLabel })}</h2>
        <LimitRings limits={view.limits} period={view.period} />
      </section>
      {view.retainer.status !== 'active' ? null : view.suspended ? (
        <FormMessage tone="danger">{t('portal.suspended')}</FormMessage>
      ) : (
        <RequestForm view={view} request={refreshAfter(actions.request)} />
      )}
      <section className="flex flex-col gap-3" aria-label={t('extras.title')}>
        <h2 className="text-title-sm text-text">{t('extras.title')}</h2>
        {view.extraRequests.length === 0 ? (
          <p className="text-body-sm text-text-secondary">{t('extras.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {view.extraRequests.map((extra) => (
              <ExtraItem
                key={extra.id}
                extra={extra}
                decides={view.decides}
                decide={refreshAfter(actions.decide)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
