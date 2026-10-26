'use client';

import * as React from 'react';
import { CalendarIcon } from 'lucide-react';
import { enUS, pt } from 'react-day-picker/locale';
import { cn } from '@agency-os/ui/lib/utils';
import { Calendar } from '@agency-os/ui/components/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@agency-os/ui/components/popover';

type DatePickerProps = {
  id?: string;
  /** Name of the hidden input that carries the ISO value; omit when the value is read from state. */
  name?: string;
  defaultValue?: string | null;
  /** Makes the picker controlled; an empty string or null means no date. */
  value?: string | null;
  locale: string;
  label: string;
  placeholder: string;
  clearLabel: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange?: (value: string | null) => void;
  className?: string;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIso(value: string | null | undefined): Date | undefined {
  const match = value ? ISO_DATE.exec(value) : null;
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDisplay(date: Date, locale: string): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return locale.toLowerCase().startsWith('pt')
    ? `${day}/${month}/${date.getFullYear()}`
    : `${month}/${day}/${date.getFullYear()}`;
}

/** Date field that submits `yyyy-MM-dd` (or an empty string) through a hidden input named `name`. */
function DatePicker({
  id,
  name,
  defaultValue,
  value,
  locale,
  label,
  placeholder,
  clearLabel,
  disabled,
  invalid,
  describedBy,
  onChange,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [internal, setInternal] = React.useState<Date | undefined>(() => parseIso(defaultValue));
  const selected = value === undefined ? internal : parseIso(value);

  function commit(next: Date | undefined) {
    setInternal(next);
    onChange?.(next ? toIso(next) : null);
  }

  return (
    <div data-slot="date-picker" className={cn('inline-flex', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            aria-label={selected ? `${label}: ${formatDisplay(selected, locale)}` : label}
            className={cn(
              'flex h-9 w-full min-w-40 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
              !selected && 'text-muted-foreground',
            )}
          >
            <span>{selected ? formatDisplay(selected, locale) : placeholder}</span>
            <CalendarIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          <Calendar
            mode="single"
            locale={locale.toLowerCase().startsWith('pt') ? pt : enUS}
            selected={selected}
            defaultMonth={selected}
            onSelect={(next) => {
              // Clicking the selected day reports undefined; clearing is the button's job.
              if (!next) return;
              commit(next);
              setOpen(false);
            }}
          />
          <div className="flex justify-end border-t border-border pt-2">
            <button
              type="button"
              onClick={() => {
                commit(undefined);
                setOpen(false);
              }}
              className="rounded-md px-2 py-1 text-sm text-text-secondary outline-none transition-colors hover:bg-surface-muted hover:text-text focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {clearLabel}
            </button>
          </div>
        </PopoverContent>
      </Popover>
      {name ? (
        <input
          type="hidden"
          name={name}
          value={selected ? toIso(selected) : ''}
          disabled={disabled}
        />
      ) : null}
    </div>
  );
}

export { DatePicker };
