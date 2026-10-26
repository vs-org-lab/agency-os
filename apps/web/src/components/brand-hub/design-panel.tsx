'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from '@agency-os/ui/components/popover';
import { FormMessage } from '@/components/forms/form-message';
import {
  contrastRatio,
  contrastWarning,
  HUB_LAYOUTS,
  type HubColorName,
  type HubDesign,
} from '@/modules/brand-hub';
import { contrastLevel } from './contrast-level';
import { hubError, type ActionResult, type HubError } from './hub-errors';

const COLOR_NAMES: HubColorName[] = ['surface', 'panel', 'text', 'textMuted', 'accent', 'divider'];
const HEX = /^#[0-9A-Fa-f]{6}$/;

/** RF-091: the hub's colours by hex, corners, logo tiles and one of four layouts. */
export function DesignPanel({
  hubId,
  design,
  save,
}: {
  hubId: string;
  design: HubDesign;
  save: (hubId: string, design: HubDesign) => Promise<ActionResult>;
}) {
  const t = useTranslations('brandHub');
  const [draft, setDraft] = useState<HubDesign>(design);
  const [stored, setStored] = useState(design);
  if (stored !== design && JSON.stringify(stored) !== JSON.stringify(design)) {
    setStored(design);
    setDraft(design);
  }
  const [result, setResult] = useState<'saved' | HubError | null>(null);
  const [pending, startTransition] = useTransition();
  const valid = COLOR_NAMES.every((name) => HEX.test(draft.colors[name]));

  const setColor = (name: HubColorName, value: string) =>
    setDraft((current) => ({ ...current, colors: { ...current.colors, [name]: value } }));

  const submit = () =>
    startTransition(async () => {
      const outcome = await save(hubId, draft).catch(
        () => ({ ok: false, code: 'not_found' }) as const,
      );
      setResult(outcome.ok ? 'saved' : hubError(outcome.code));
    });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-body-sm font-medium text-text">{t('design.title')}</legend>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {COLOR_NAMES.map((name) => {
            const label = t(`design.colors.${name}`);
            const color = draft.colors[name];
            const colorValid = HEX.test(color);
            const isTextColor = name === 'text' || name === 'textMuted';
            const ratio =
              valid && colorValid
                ? isTextColor
                  ? contrastRatio(color, draft.colors.surface)
                  : contrastRatio(draft.colors.text, color)
                : null;
            const level = ratio === null ? null : contrastLevel(ratio);
            return (
              <Popover key={name}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${label} ${color}`}
                    className="flex h-24 flex-col justify-between rounded-md border border-border p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{
                      backgroundColor: colorValid ? color : undefined,
                      color: colorValid
                        ? contrastRatio('#000000', color) >= contrastRatio('#FFFFFF', color)
                          ? '#000000'
                          : '#FFFFFF'
                        : undefined,
                    }}
                  >
                    <span className="text-body-sm font-medium">{label}</span>
                    <span className="flex flex-col">
                      <span className="font-mono text-caption">{color}</span>
                      {ratio !== null && level ? (
                        <span className="text-caption">
                          {t('design.contrastRatio', {
                            ratio: Math.round(ratio * 10) / 10,
                            level: level === 'fail' ? t('design.contrastFail') : level,
                          })}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="flex w-56 flex-col gap-3">
                  <input
                    type="color"
                    aria-label={label}
                    value={colorValid ? color : '#000000'}
                    onChange={(event) => setColor(name, event.target.value.toUpperCase())}
                    className="h-10 w-full cursor-pointer rounded-md border border-border bg-surface"
                  />
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`hub-color-${name}`}>{label}</Label>
                    <Input
                      id={`hub-color-${name}`}
                      aria-label={`${label} (hex)`}
                      value={color}
                      maxLength={7}
                      aria-invalid={!colorValid}
                      onChange={(event) => setColor(name, event.target.value)}
                      className="font-mono"
                    />
                  </div>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      </fieldset>
      {valid && contrastWarning(draft) ? (
        <FormMessage tone="warning">{t('design.contrast')}</FormMessage>
      ) : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-body-sm font-medium text-text">{t('design.corners')}</legend>
        {(['soft', 'square'] as const).map((corners) => (
          <label key={corners} className="flex items-center gap-2 text-body-sm text-text">
            <input
              type="radio"
              name="hub-corners"
              checked={draft.corners === corners}
              onChange={() => setDraft((current) => ({ ...current, corners }))}
            />
            {t(`design.cornerOptions.${corners}`)}
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-body-sm text-text">
        <input
          type="checkbox"
          checked={draft.logoTiles}
          onChange={(event) =>
            setDraft((current) => ({ ...current, logoTiles: event.target.checked }))
          }
        />
        {t('design.logoTiles')}
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-body-sm font-medium text-text">{t('design.layout')}</legend>
        {HUB_LAYOUTS.map((layout) => (
          <label key={layout} className="flex items-center gap-2 text-body-sm text-text">
            <input
              type="radio"
              name="hub-layout"
              checked={draft.layout === layout}
              onChange={() => setDraft((current) => ({ ...current, layout }))}
            />
            {t(`design.layouts.${layout}`)}
          </label>
        ))}
      </fieldset>
      <Button type="submit" size="sm" disabled={pending || !valid} className="self-start">
        {t('design.save')}
      </Button>
      {result === 'saved' ? (
        <FormMessage tone="success">{t('design.saved')}</FormMessage>
      ) : result ? (
        <FormMessage tone="danger">{t(`errors.${result}`)}</FormMessage>
      ) : null}
    </form>
  );
}
