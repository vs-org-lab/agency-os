'use client';

import * as React from 'react';
import { CalendarIcon } from 'lucide-react';
import { enUS, pt } from 'react-day-picker/locale';
import type { DateRange } from 'react-day-picker';
import { cn } from '@agency-os/ui/lib/utils';
import { formatDisplay, parseIso, toIso } from '@agency-os/ui/lib/iso-date';
import { Calendar } from '@agency-os/ui/components/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@agency-os/ui/components/popover';

type IsoRange = { from: string; to: string };

type DateRangeFieldProps = {
  id?: string;
  locale: string;
  label: string;
  /** Shown while no range is chosen. */
  placeholder: string;
  clearLabel: string;
  value: IsoRange | null;
  onChange: (value: IsoRange | null) => void;
  /** Inclusive ISO bounds; days outside them cannot be chosen. */
  min: string;
  max: string;
  presets: Array<{ label: string; from: string; to: string }>;
  className?: string;
};

const clamp = (date: Date, low: Date | undefined, high: Date | undefined): Date => {
  if (low && date < low) return low;
  if (high && date > high) return high;
  return date;
};

/** Date interval field: presets, a two-click range calendar and a clear action. */
function DateRangeField({
  id,
  locale,
  label,
  placeholder,
  clearLabel,
  value,
  onChange,
  min,
  max,
  presets,
  className,
}: DateRangeFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [pendingStart, setPendingStart] = React.useState<Date | null>(null);
  const minDate = parseIso(min);
  const maxDate = parseIso(max);
  const from = parseIso(value?.from);
  const to = parseIso(value?.to);
  const committed: DateRange | undefined = from ? { from, to } : undefined;
  const selected: DateRange | undefined = pendingStart ? { from: pendingStart } : committed;
  const display =
    from && to ? `${formatDisplay(from, locale)} – ${formatDisplay(to, locale)}` : placeholder;

  function close() {
    setPendingStart(null);
    setOpen(false);
  }

  function commit(next: IsoRange | null) {
    onChange(next);
    close();
  }

  function pickDay(day: Date) {
    if (!pendingStart) {
      setPendingStart(day);
      return;
    }
    const [start, end] = day < pendingStart ? [day, pendingStart] : [pendingStart, day];
    commit({ from: toIso(start), to: toIso(end) });
  }

  return (
    <div data-slot="date-range-field" className={cn('inline-flex', className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setPendingStart(null);
        }}
      >
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            aria-label={from && to ? `${label}: ${display}` : label}
            className={cn(
              'flex h-9 w-full min-w-48 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
              !(from && to) && 'text-muted-foreground',
            )}
          >
            <span>{display}</span>
            <CalendarIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          {presets.length > 0 ? (
            <div className="flex flex-wrap gap-1 border-b border-border pb-2">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => commit({ from: preset.from, to: preset.to })}
                  className="rounded-md px-2 py-1 text-sm text-text-secondary outline-none transition-colors hover:bg-surface-muted hover:text-text focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ) : null}
          <Calendar
            mode="range"
            locale={locale.toLowerCase().startsWith('pt') ? pt : enUS}
            selected={selected}
            defaultMonth={from ?? clamp(new Date(), minDate, maxDate)}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            onSelect={(_range, triggerDate) => pickDay(triggerDate)}
            classNames={{
              range_middle:
                '[&>button]:rounded-none [&>button]:bg-surface-muted! [&>button]:text-text!',
            }}
          />
          <div className="flex justify-end border-t border-border pt-2">
            <button
              type="button"
              onClick={() => commit(null)}
              className="rounded-md px-2 py-1 text-sm text-text-secondary outline-none transition-colors hover:bg-surface-muted hover:text-text focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {clearLabel}
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export { DateRangeField };
export type { DateRangeFieldProps, IsoRange };
