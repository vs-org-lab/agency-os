'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@agency-os/ui/lib/utils';

const OPTIONS = [
  { value: 'light', Icon: Sun },
  { value: 'dark', Icon: Moon },
  { value: 'system', Icon: Monitor },
] as const;

type ThemeValue = (typeof OPTIONS)[number]['value'];

export function ThemeToggle({
  label,
  labels,
  className,
}: {
  label: string;
  labels: Record<ThemeValue, string>;
  className?: string;
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current: ThemeValue = mounted && theme ? (theme as ThemeValue) : 'system';

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = OPTIONS.findIndex((option) => option.value === current);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = OPTIONS[(index + step + OPTIONS.length) % OPTIONS.length];
    if (next) setTheme(next.value);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md bg-surface-muted p-0.5',
        className,
      )}
    >
      {OPTIONS.map(({ value, Icon }) => {
        const checked = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={labels[value]}
            title={labels[value]}
            tabIndex={checked ? 0 : -1}
            onClick={() => setTheme(value)}
            className={cn(
              'flex size-7 items-center justify-center rounded-sm text-text-secondary transition-colors duration-(--duration-fast)',
              checked
                ? 'bg-surface text-text shadow-xs ring-1 ring-border-strong'
                : 'hover:text-text',
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
