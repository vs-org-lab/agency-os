'use client';

import { useLocale, useTranslations } from 'next-intl';
import { DatePicker } from '@agency-os/ui/components/date-picker';

/** The shared DatePicker with the session locale and the interface texts filled in. */
export function DateField({
  id,
  name,
  label,
  value,
  defaultValue,
  onValueChange,
  disabled,
  invalid,
  describedBy,
  className,
}: {
  id?: string;
  name?: string;
  /** Accessible name of the field. */
  label: string;
  /** Controlled `yyyy-MM-dd` value, or an empty string for no date. */
  value?: string;
  /** Initial value when the field keeps its own state. */
  defaultValue?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}) {
  const t = useTranslations('interaction.datePicker');
  const locale = useLocale();

  return (
    <DatePicker
      id={id}
      name={name}
      value={value}
      defaultValue={defaultValue}
      locale={locale}
      label={label}
      placeholder={t('placeholder')}
      clearLabel={t('clear')}
      disabled={disabled}
      invalid={invalid}
      describedBy={describedBy}
      onChange={(next) => onValueChange(next ?? '')}
      className={className}
    />
  );
}
