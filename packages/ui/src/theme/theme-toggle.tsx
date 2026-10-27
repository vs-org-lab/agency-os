'use client';

import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@agency-os/ui/lib/utils';
import { LayoutGroup, m, transitions } from '../motion';

const OPTIONS = ['dark', 'light', 'system'] as const;

type ThemeValue = (typeof OPTIONS)[number];

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
  const groupId = useId();
  useEffect(() => setMounted(true), []);
  const current: ThemeValue =
    mounted && theme && (OPTIONS as readonly string[]).includes(theme)
      ? (theme as ThemeValue)
      : 'dark';

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = OPTIONS.indexOf(current);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = OPTIONS[(index + step + OPTIONS.length) % OPTIONS.length];
    if (next) setTheme(next);
  }

  return (
    <LayoutGroup id={groupId}>
      <div
        role="radiogroup"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn(
          'grid grid-cols-3 rounded-md border border-border bg-canvas p-0.5',
          className,
        )}
      >
        {OPTIONS.map((value) => {
          const checked = current === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => setTheme(value)}
              className={cn(
                'relative isolate h-7 rounded-sm px-2 text-caption font-medium transition-colors duration-(--duration-fast)',
                checked ? 'text-text' : 'text-text-secondary hover:text-text',
              )}
            >
              {checked ? (
                <m.span
                  layoutId="theme-indicator"
                  aria-hidden="true"
                  transition={transitions.morph}
                  className="absolute inset-0 -z-10 rounded-sm bg-surface-muted ring-1 ring-border-strong"
                />
              ) : null}
              {labels[value]}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
