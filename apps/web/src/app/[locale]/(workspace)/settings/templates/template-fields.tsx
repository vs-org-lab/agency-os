'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import type { Localized } from '@/modules/diagnosis';

export const SELECT =
  'h-9 rounded-md border border-border bg-surface px-2 text-body-sm text-text disabled:opacity-60';

export function newIdentifier(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

export function LocalizedFields({
  id,
  label,
  value,
  multiline,
  onChange,
}: {
  id: string;
  label: string;
  value: Localized;
  multiline?: boolean;
  onChange: (value: Localized) => void;
}) {
  const t = useTranslations('settings.coreTemplates');
  const Field = multiline ? Textarea : Input;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-pt`}>{label}</Label>
        <Field
          id={`${id}-pt`}
          value={value['pt-PT']}
          onChange={(event) => onChange({ ...value, 'pt-PT': event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-en`}>{t('english')}</Label>
        <Field
          id={`${id}-en`}
          value={value.en}
          onChange={(event) => onChange({ ...value, en: event.target.value })}
        />
      </div>
    </div>
  );
}
