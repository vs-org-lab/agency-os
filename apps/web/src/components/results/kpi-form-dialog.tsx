'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Checkbox } from '@agency-os/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@agency-os/ui/components/dialog';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@agency-os/ui/components/select';
import { FormMessage } from '@/components/forms/form-message';
import { notify } from '@/components/ui/notify';
import type { KpiAggregation, KpiFormat, ResultsActionResult } from '@/modules/results';

export type KpiDraft = {
  kpiId?: string;
  name: string;
  format: KpiFormat;
  aggregation: KpiAggregation;
  source: string;
  target: string;
  clientVisible: boolean;
};

export const EMPTY_KPI: KpiDraft = {
  name: '',
  format: 'number',
  aggregation: 'sum',
  source: '',
  target: '',
  clientVisible: true,
};

const FORMATS: KpiFormat[] = ['number', 'percent', 'currency', 'ratio'];
const AGGREGATIONS: KpiAggregation[] = ['sum', 'average', 'last'];

/** Creates or edits an indicator; the target accepts a decimal comma. */
export function KpiFormDialog({
  clientId,
  open,
  onOpenChange,
  initial,
  save,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: KpiDraft;
  save: (input: {
    clientId: string;
    kpiId?: string;
    name: string;
    format: KpiFormat;
    aggregation: KpiAggregation;
    source: string;
    target: string | null;
    clientVisible: boolean;
  }) => Promise<ResultsActionResult>;
}) {
  const t = useTranslations('results');
  const id = useId();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof KpiDraft>(key: K, value: KpiDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = () =>
    startTransition(async () => {
      const target = draft.target.trim().replace(/\s/g, '').replace(',', '.');
      const result = await save({
        clientId,
        kpiId: draft.kpiId,
        name: draft.name,
        format: draft.format,
        aggregation: draft.aggregation,
        source: draft.source,
        target: target === '' ? null : target,
        clientVisible: draft.clientVisible,
      });
      if (!result.ok) {
        setError(result.code);
        return;
      }
      setError(null);
      notify.success(t('form.saved'));
      onOpenChange(false);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(initial);
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent closeLabel={t('form.cancel')}>
        <DialogHeader>
          <DialogTitle>{initial.kpiId ? t('form.editTitle') : t('form.createTitle')}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {error ? (
            <FormMessage tone="danger">
              {t(
                `form.errors.${error === 'duplicate_name' || error === 'invalid_input' ? error : 'not_found'}`,
              )}
            </FormMessage>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-name`}>{t('form.name')}</Label>
            <Input
              id={`${id}-name`}
              value={draft.name}
              maxLength={60}
              required
              onChange={(event) => set('name', event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-format`}>{t('form.format')}</Label>
              <Select
                value={draft.format}
                onValueChange={(value) => set('format', value as KpiFormat)}
              >
                <SelectTrigger id={`${id}-format`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map((format) => (
                    <SelectItem key={format} value={format}>
                      {t(`form.formats.${format}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-aggregation`}>{t('form.aggregation')}</Label>
              <Select
                value={draft.aggregation}
                onValueChange={(value) => set('aggregation', value as KpiAggregation)}
              >
                <SelectTrigger id={`${id}-aggregation`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGGREGATIONS.map((aggregation) => (
                    <SelectItem key={aggregation} value={aggregation}>
                      {t(`aggregationHint.${aggregation}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-source`}>{t('form.source')}</Label>
              <Input
                id={`${id}-source`}
                value={draft.source}
                maxLength={40}
                placeholder={t('form.sourcePlaceholder')}
                onChange={(event) => set('source', event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-target`}>{t('form.target')}</Label>
              <Input
                id={`${id}-target`}
                inputMode="decimal"
                value={draft.target}
                onChange={(event) => set('target', event.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${id}-visible`}
              checked={draft.clientVisible}
              onCheckedChange={(checked) => set('clientVisible', checked === true)}
            />
            <Label htmlFor={`${id}-visible`} className="font-normal">
              {t('form.clientVisible')}
            </Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('form.cancel')}
            </Button>
            <Button type="submit" disabled={pending || draft.name.trim() === ''}>
              {t('form.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
