'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { cn } from '@agency-os/ui/lib/utils';

export const AUTOSAVE_DELAY_MS = 800;

type SaveState = 'idle' | 'editing' | 'saving' | 'saved' | 'failed';

/**
 * A note that saves itself while the founder talks. A pending edit is sent when the field
 * unmounts (next block, another tab) or the page is hidden, so leaving a field never drops
 * text; a newer value from the server replaces the text only while nothing is being edited.
 */
export function NoteField({
  id,
  label,
  initialValue,
  save,
  onSaved,
  rows = 4,
  placeholder,
  disabled = false,
  className,
}: {
  id: string;
  label: string;
  initialValue: string;
  save: (body: string) => Promise<boolean>;
  onSaved?: (body: string) => void;
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
  const pending = useRef(false);
  const saveRef = useRef(save);
  const onSavedRef = useRef(onSaved);
  saveRef.current = save;
  onSavedRef.current = onSaved;

  useEffect(() => {
    if (pending.current || latest.current === initialValue) return;
    latest.current = initialValue;
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const flush = () => {
      if (!pending.current) return;
      if (timer.current) clearTimeout(timer.current);
      pending.current = false;
      const body = latest.current;
      void saveRef.current(body).then((ok) => {
        if (ok) onSavedRef.current?.(body);
      });
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  const persist = async (body: string) => {
    pending.current = false;
    setState('saving');
    const ok = await saveRef.current(body).catch(() => false);
    if (ok) onSavedRef.current?.(body);
    if (latest.current === body) setState(ok ? 'saved' : 'failed');
  };

  const schedule = (body: string) => {
    latest.current = body;
    pending.current = true;
    setValue(body);
    setState('editing');
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
