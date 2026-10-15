'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { RETAINER_LIMIT_KINDS, type StaffRetainerView } from '@/modules/retainers';
import { decimal, retainerError, SELECT, type RetainerError, type RetainerResult } from './shared';

export type RetainerFormInput = {
  clientId: string;
  projectId: string;
  tier: string;
  monthlyFee: string;
  currency: string;
  startsOn: string;
  reviewOn: string;
  status: string;
  limits: { kind: string; monthlyLimit: string }[];
};

export type SaveRetainer = (input: RetainerFormInput) => Promise<RetainerResult>;

const CURRENCIES = ['EUR', 'GBP', 'USD', 'AOA'] as const;

/** RF-110: the retainer's tier, fee, dates and monthly limits; blank limits are left out. */
export function RetainerForm({
  clientId,
  view,
  save,
  onDone,
}: {
  clientId: string;
  view: StaffRetainerView;
  save: SaveRetainer;
  onDone: () => void;
}) {
  const t = useTranslations('retainers');
  const id = useId();
  const retainer = view.retainer;
  const [fields, setFields] = useState({
    projectId: retainer?.projectId ?? view.projects[0]?.id ?? '',
    tier: retainer?.tier ?? '',
    monthlyFee: retainer?.monthlyFee ?? '',
    currency: retainer?.currency ?? 'EUR',
    startsOn: retainer?.startsOn ?? '',
    reviewOn: retainer?.reviewOn ?? '',
    status: retainer?.status ?? 'active',
  });
  const [limits, setLimits] = useState<Record<string, string>>(() =>
    Object.fromEntries(view.limits.map((limit) => [limit.kind, String(limit.limit)])),
  );
  const [message, setMessage] = useState<'saved' | RetainerError | null>(null);
  const [pending, startTransition] = useTransition();
  const field = (name: string) => `${id}-${name}`;
  const set = (name: keyof typeof fields) => (value: string) =>
    setFields((current) => ({ ...current, [name]: value }));

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await save({
            clientId,
            ...fields,
            monthlyFee: decimal(fields.monthlyFee),
            limits: Object.entries(limits)
              .filter(([, value]) => value.trim() !== '')
              .map(([kind, value]) => ({ kind, monthlyLimit: decimal(value) })),
          }).catch(() => ({ ok: false as const, code: 'not_found' }));
          if (result.ok) {
            setMessage('saved');
            onDone();
          } else setMessage(retainerError(result.code));
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('project')}>{t('form.project')}</Label>
          <select
            id={field('project')}
            value={fields.projectId}
            disabled={retainer !== null}
            onChange={(event) => set('projectId')(event.target.value)}
            className={SELECT}
          >
            {view.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('tier')}>{t('form.tier')}</Label>
          <Input
            id={field('tier')}
            required
            maxLength={40}
            value={fields.tier}
            onChange={(event) => set('tier')(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={field('fee')}>{t('form.fee')}</Label>
            <Input
              id={field('fee')}
              inputMode="decimal"
              required
              value={fields.monthlyFee}
              onChange={(event) => set('monthlyFee')(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={field('currency')}>{t('form.currency')}</Label>
            <select
              id={field('currency')}
              value={fields.currency}
              onChange={(event) => set('currency')(event.target.value)}
              className={SELECT}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('status')}>{t('form.status')}</Label>
          <select
            id={field('status')}
            value={fields.status}
            onChange={(event) => set('status')(event.target.value)}
            className={SELECT}
          >
            <option value="active">{t('form.statuses.active')}</option>
            <option value="ended">{t('form.statuses.ended')}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('starts')}>{t('form.startsOn')}</Label>
          <Input
            id={field('starts')}
            type="date"
            required
            value={fields.startsOn}
            onChange={(event) => set('startsOn')(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('review')}>{t('form.reviewOn')}</Label>
          <Input
            id={field('review')}
            type="date"
            required
            value={fields.reviewOn}
            onChange={(event) => set('reviewOn')(event.target.value)}
          />
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body-sm font-medium text-text">{t('form.limits')}</legend>
        <p className="text-caption text-text-secondary">{t('form.limitsHint')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {RETAINER_LIMIT_KINDS.map((kind) => (
            <div key={kind} className="flex flex-col gap-1">
              <Label htmlFor={field(`limit-${kind}`)}>{t(`kinds.${kind}`)}</Label>
              <Input
                id={field(`limit-${kind}`)}
                inputMode="decimal"
                value={limits[kind] ?? ''}
                onChange={(event) =>
                  setLimits((current) => ({ ...current, [kind]: event.target.value }))
                }
              />
            </div>
          ))}
        </div>
      </fieldset>
      {message === 'saved' ? (
        <FormMessage tone="success">{t('form.saved')}</FormMessage>
      ) : message ? (
        <FormMessage tone="danger">{t(`errors.${message}`)}</FormMessage>
      ) : null}
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {t('form.save')}
      </Button>
    </form>
  );
}
