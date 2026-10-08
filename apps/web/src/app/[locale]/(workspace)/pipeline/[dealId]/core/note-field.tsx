'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { cn } from '@agency-os/ui/lib/utils';

export const AUTOSAVE_DELAY_MS = 800;

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

export function NoteField({
  id,
  label,
  initialValue,
  save,
  rows = 4,
  placeholder,
  disabled = false,
  className,
}: {
  id: string;
  label: string;
  initialValue: string;
  save: (body: string) => Promise<boolean>;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations('diagnosis.note');
  const [value, setValue] = useState(initialValue);
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(initialValue);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const persist = async (body: string) => {
    setState('saving');
    const ok = await save(body).catch(() => false);
    if (latest.current === body) setState(ok ? 'saved' : 'failed');
  };

  const schedule = (body: string) => {
    latest.current = body;
    setValue(body);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void persist(body);
    }, AUTOSAVE_DELAY_MS);
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span aria-live="polite" className="text-caption text-text-tertiary">
          {state === 'saving' ? t('saving') : null}
          {state === 'saved' ? t('saved') : null}
        </span>
      </div>
      <Textarea
        id={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={20_000}
        onChange={(event) => schedule(event.target.value)}
      />
      {state === 'failed' ? (
        <div role="alert" className="flex items-center gap-2 text-body-sm text-danger">
          <span>{t('failed')}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void persist(value)}>
            {t('retry')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
