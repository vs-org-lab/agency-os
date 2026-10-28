'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Currency, Locale } from '@agency-os/i18n';
import { Checkbox } from '@agency-os/ui/components/checkbox';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { cn } from '@agency-os/ui/lib/utils';
import {
  AD_PLATFORMS,
  AUTOMATION_TOOLS,
  MODULE_CODES,
  moduleClauses,
  parseModules,
  PAYMENT_PRESETS,
  SOCIAL_PLATFORMS,
  SOLUTIONS,
  type ContractModule,
  type ModuleCode,
} from '@/modules/contracts';
import type { ProposalOptionInput } from '@/modules/contracts/server';

const DASH = '—';

const FIELD = 'h-11 rounded-md border border-border bg-surface px-3 text-body text-text md:h-9';

const PLATFORM_NAMES: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  youtube: 'YouTube',
  meta: 'Meta Ads',
  google: 'Google Ads',
};

const TOOL_NAMES: Record<string, string> = {
  make: 'Make.com',
  n8n: 'n8n',
  zapier: 'Zapier',
  openai: 'OpenAI API',
};

const DEFAULTS: Record<ModuleCode, ContractModule> = {
  A: { code: 'A', params: { videosPerMonth: 4, revisions: 2 } },
  B: { code: 'B', params: { platforms: ['instagram'], feedPosts: 12, storiesPerWeek: 3 } },
  C: { code: 'C', params: { platforms: ['meta'], mediaBudget: '', managementFee: '' } },
  D: {
    code: 'D',
    params: { solution: 'website', technologies: '', hosting: false, sourceCode: true },
  },
  E: { code: 'E', params: { tools: ['n8n'], maintenanceMonths: 0 } },
};

function toggled<T extends string>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

function NumberField({
  id,
  label,
  value,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={0}
        max={max}
        value={String(value)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function Choices<T extends string>({
  legend,
  values,
  selected,
  names,
  onChange,
}: {
  legend: string;
  values: readonly T[];
  selected: readonly T[];
  names: (value: T) => string;
  onChange: (selected: T[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2 md:col-span-2">
      <legend className="mb-1 text-label text-text">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => {
          const on = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(toggled(selected, value))}
              className={cn(
                'rounded-full border px-3 py-1 text-body-sm transition-colors duration-150',
                on
                  ? 'border-text bg-text text-canvas'
                  : 'border-border text-text-secondary hover:border-border-strong',
              )}
            >
              {names(value)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ModuleParams({
  prefix,
  module,
  onChange,
}: {
  prefix: string;
  module: ContractModule;
  onChange: (module: ContractModule) => void;
}) {
  const t = useTranslations('contracts.proposal.modules');
  const id = (name: string) => `${prefix}-${module.code}-${name}`;
  let fields: ReactNode;
  switch (module.code) {
    case 'A':
      fields = (
        <>
          <NumberField
            id={id('videos')}
            label={t('fields.videosPerMonth')}
            value={module.params.videosPerMonth}
            max={999}
            onChange={(videosPerMonth) =>
              onChange({ ...module, params: { ...module.params, videosPerMonth } })
            }
          />
          <NumberField
            id={id('revisions')}
            label={t('fields.revisions')}
            value={module.params.revisions}
            max={20}
            onChange={(revisions) =>
              onChange({ ...module, params: { ...module.params, revisions } })
            }
          />
        </>
      );
      break;
    case 'B':
      fields = (
        <>
          <Choices
            legend={t('fields.platforms')}
            values={SOCIAL_PLATFORMS}
            selected={module.params.platforms}
            names={(value) => PLATFORM_NAMES[value] ?? value}
            onChange={(platforms) =>
              onChange({ ...module, params: { ...module.params, platforms } })
            }
          />
          <NumberField
            id={id('feed')}
            label={t('fields.feedPosts')}
            value={module.params.feedPosts}
            max={999}
            onChange={(feedPosts) =>
              onChange({ ...module, params: { ...module.params, feedPosts } })
            }
          />
          <NumberField
            id={id('stories')}
            label={t('fields.storiesPerWeek')}
            value={module.params.storiesPerWeek}
            max={999}
            onChange={(storiesPerWeek) =>
              onChange({ ...module, params: { ...module.params, storiesPerWeek } })
            }
          />
        </>
      );
      break;
    case 'C':
      fields = (
        <>
          <Choices
            legend={t('fields.platforms')}
            values={AD_PLATFORMS}
            selected={module.params.platforms}
            names={(value) =>
              value === 'tiktok' ? 'TikTok Ads' : (PLATFORM_NAMES[value] ?? value)
            }
            onChange={(platforms) =>
              onChange({ ...module, params: { ...module.params, platforms } })
            }
          />
          {(['mediaBudget', 'managementFee'] as const).map((field) => (
            <div key={field} className="flex flex-col gap-1">
              <Label htmlFor={id(field)}>{t(`fields.${field}`)}</Label>
              <Input
                id={id(field)}
                inputMode="decimal"
                value={module.params[field]}
                onChange={(event) => {
                  const value = event.target.value.replace(',', '.');
                  onChange({ ...module, params: { ...module.params, [field]: value } });
                }}
              />
            </div>
          ))}
        </>
      );
      break;
    case 'D':
      fields = (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor={id('solution')}>{t('fields.solution')}</Label>
            <select
              id={id('solution')}
              className={FIELD}
              value={module.params.solution}
              onChange={(event) =>
                onChange({
                  ...module,
                  params: {
                    ...module.params,
                    solution: event.target.value as (typeof SOLUTIONS)[number],
                  },
                })
              }
            >
              {SOLUTIONS.map((solution) => (
                <option key={solution} value={solution}>
                  {t(`solutions.${solution}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={id('technologies')}>{t('fields.technologies')}</Label>
            <Input
              id={id('technologies')}
              maxLength={120}
              value={module.params.technologies}
              onChange={(event) =>
                onChange({
                  ...module,
                  params: { ...module.params, technologies: event.target.value },
                })
              }
            />
          </div>
          {(['hosting', 'sourceCode'] as const).map((field) => (
            <div key={field} className="flex items-center gap-2">
              <Checkbox
                id={id(field)}
                checked={module.params[field]}
                onCheckedChange={(checked) =>
                  onChange({ ...module, params: { ...module.params, [field]: checked === true } })
                }
              />
              <Label htmlFor={id(field)} className="text-body-sm text-text">
                {t(`fields.${field}`)}
              </Label>
            </div>
          ))}
        </>
      );
      break;
    case 'E':
      fields = (
        <>
          <Choices
            legend={t('fields.tools')}
            values={AUTOMATION_TOOLS}
            selected={module.params.tools}
            names={(value) => TOOL_NAMES[value] ?? t('otherTool')}
            onChange={(tools) => onChange({ ...module, params: { ...module.params, tools } })}
          />
          <NumberField
            id={id('maintenance')}
            label={t('fields.maintenanceMonths')}
            value={module.params.maintenanceMonths}
            max={36}
            onChange={(maintenanceMonths) =>
              onChange({ ...module, params: { ...module.params, maintenanceMonths } })
            }
          />
        </>
      );
      break;
  }
  return <div className="grid gap-3 border-t border-border p-4 md:grid-cols-2">{fields}</div>;
}

/** Renders the clause preview: module headings, commitments as a list, parameters as lines. */
function ClausePreview({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-body-sm text-text">
      {text.split('\n').map((line, index) => {
        if (line.startsWith('### ')) {
          return (
            <h5 key={index} className="pt-3 text-label text-text first:pt-0">
              {line.slice(4)}
            </h5>
          );
        }
        if (line.startsWith('- ')) {
          return (
            <p key={index} className="flex gap-2 text-text-secondary">
              <span aria-hidden>{DASH}</span>
              {line.slice(2)}
            </p>
          );
        }
        return line ? <p key={index}>{line}</p> : null;
      })}
    </div>
  );
}

/**
 * The services of a proposal option as the brand contract's modules A–E: each card switches a
 * module on and opens its parameters; below, the clauses the contract will include.
 */
export function ModuleBuilder({
  prefix,
  modules,
  locale,
  currency,
  onChange,
}: {
  prefix: string;
  modules: ContractModule[];
  locale: Locale;
  currency: Currency;
  onChange: (modules: ContractModule[]) => void;
}) {
  const t = useTranslations('contracts.proposal.modules');
  const chosen = new Map(modules.map((module) => [module.code, module]));
  const valid = modules.filter((module) => parseModules([module]) !== null);
  const preview = moduleClauses(valid, locale, currency);
  const set = (code: ModuleCode, module: ContractModule | null) =>
    onChange(
      MODULE_CODES.flatMap((entry) => {
        if (entry === code) return module ? [module] : [];
        const current = chosen.get(entry);
        return current ? [current] : [];
      }),
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-label text-text">{t('title')}</span>
        <span className="text-caption text-text-secondary">{t('hint')}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {MODULE_CODES.map((code) => {
          const module = chosen.get(code);
          return (
            <li
              key={code}
              className={cn(
                'overflow-hidden rounded-md border transition-colors duration-150',
                module ? 'border-border-strong bg-surface' : 'border-border',
              )}
            >
              <button
                type="button"
                aria-pressed={module !== undefined}
                onClick={() => set(code, module ? null : DEFAULTS[code])}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="font-mono text-caption text-text-tertiary">{code}</span>
                <span className="flex-1 text-body-sm font-medium text-text">
                  {t(`titles.${code}`)}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full border',
                    module ? 'border-text bg-text text-canvas' : 'border-border',
                  )}
                >
                  {module ? <Check className="size-3" /> : null}
                </span>
              </button>
              {module ? (
                <ModuleParams
                  prefix={prefix}
                  module={module}
                  onChange={(next) => set(code, next)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {preview ? (
        <section
          aria-label={t('preview')}
          className="flex flex-col gap-2 rounded-md border border-border bg-surface-muted p-4"
        >
          <span className="font-mono text-[11px] tracking-[0.12em] text-text-tertiary uppercase">
            {t('preview')}
          </span>
          <ClausePreview text={preview} />
        </section>
      ) : null}
    </div>
  );
}

/** The brand template's three payment options, applied to the option's plan and retainer. */
export function PaymentPresets({
  locale,
  onApply,
}: {
  locale: Locale;
  onApply: (change: (option: ProposalOptionInput) => ProposalOptionInput) => void;
}) {
  const t = useTranslations('contracts.proposal.presets');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-caption text-text-secondary">{t('label')}</span>
      {(['A', 'B', 'C'] as const).map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() =>
            onApply((current) => ({
              ...current,
              paymentPlan: PAYMENT_PRESETS[preset].steps(locale),
              retainerMonthly: PAYMENT_PRESETS[preset].retainer
                ? (current.retainerMonthly ?? '')
                : current.retainerMonthly,
              retainerMonths: PAYMENT_PRESETS[preset].retainer
                ? (current.retainerMonths ?? 6)
                : current.retainerMonths,
            }))
          }
          className="rounded-full border border-border px-3 py-1 text-body-sm text-text transition-colors duration-150 hover:border-border-strong"
        >
          {t(`options.${preset}`)}
        </button>
      ))}
    </div>
  );
}
