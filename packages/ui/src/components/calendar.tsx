'use client';

import * as React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@agency-os/ui/lib/utils';

type CalendarProps = React.ComponentProps<typeof DayPicker>;

const navButton =
  'inline-flex size-8 items-center justify-center rounded-md text-text-secondary outline-none transition-colors hover:bg-surface-muted hover:text-text focus-visible:ring-[3px] focus-visible:ring-ring/50';

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-1', className)}
      classNames={{
        root: 'w-fit text-sm',
        months: 'relative flex flex-col gap-4',
        month: 'flex flex-col gap-3',
        month_caption: 'flex h-8 items-center justify-center px-8 font-medium text-text',
        caption_label: 'text-sm font-medium',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        button_previous: navButton,
        button_next: navButton,
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-center text-xs font-normal text-text-tertiary',
        week: 'mt-1 flex w-full',
        day: 'size-9 p-0 text-center text-sm',
        day_button:
          'inline-flex size-9 items-center justify-center rounded-md text-text outline-none transition-colors hover:bg-surface-muted focus-visible:ring-[3px] focus-visible:ring-ring/50',
        selected:
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary',
        today: '[&>button]:border [&>button]:border-border-strong',
        outside: 'text-text-tertiary opacity-60',
        disabled: 'opacity-40',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName }) =>
          orientation === 'left' ? (
            <ChevronLeftIcon className={cn('size-4', chevronClassName)} />
          ) : (
            <ChevronRightIcon className={cn('size-4', chevronClassName)} />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
export type { CalendarProps };
