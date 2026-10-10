'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@agency-os/ui/components/button';
import { cn } from '@agency-os/ui/lib/utils';

type ActionState = 'idle' | 'pending' | 'done';

const DONE_RESET_MS = 2400;

/**
 * A button whose label follows its action: idle, pending, done. All labels share one grid cell,
 * so the button keeps the width of the longest and only the text crossfades (120 ms, none with
 * reduced motion).
 */
export function ActionButton({
  labels,
  ariaLabel,
  action,
  variant = 'default',
  size = 'sm',
  disabled = false,
  onResult,
}: {
  labels: Record<ActionState, string>;
  /** The accessible name while idle, when the visible label is shared by several rows. */
  ariaLabel?: string;
  action: () => Promise<{ ok: true } | { ok: false; code: string }>;
  variant?: 'default' | 'outline';
  size?: 'sm' | 'default';
  disabled?: boolean;
  onResult?: (result: { ok: true } | { ok: false; code: string }) => void;
}) {
  const [state, setState] = useState<ActionState>('idle');
  const [, startTransition] = useTransition();
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (reset.current) clearTimeout(reset.current);
    },
    [],
  );

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={disabled || state === 'pending'}
      aria-label={state === 'idle' && ariaLabel ? ariaLabel : labels[state]}
      onClick={() => {
        setState('pending');
        startTransition(async () => {
          const result = await action().catch(() => ({ ok: false, code: 'not_found' }) as const);
          onResult?.(result);
          setState(result.ok ? 'done' : 'idle');
          if (result.ok) {
            reset.current = setTimeout(() => setState('idle'), DONE_RESET_MS);
          }
        });
      }}
    >
      <span className="inline-grid">
        {(Object.keys(labels) as ActionState[]).map((key) => (
          <span
            key={key}
            aria-hidden="true"
            className={cn(
              '[grid-area:1/1] motion-safe:transition-opacity motion-safe:duration-[120ms] motion-safe:ease-out',
              key === state ? 'opacity-100' : 'opacity-0',
            )}
          >
            {labels[key]}
          </span>
        ))}
      </span>
    </Button>
  );
}
