'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { cn } from '@agency-os/ui/lib/utils';

const HOLD_KEYS = new Set(['Enter', ' ']);

/**
 * Press and hold to run an irreversible action: releasing early cancels. Works with pointer and
 * with Enter or Space held down; the fill follows the hold and becomes instant with reduced motion.
 */
export function HoldToConfirm({
  label,
  ariaLabel,
  onConfirm,
  durationMs = 1600,
  disabled = false,
  className,
}: {
  label: string;
  /** The accessible name when the visible label is shared by several rows. */
  ariaLabel?: string;
  onConfirm: () => void;
  durationMs?: number;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations('interaction');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [asking, setAsking] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }, []);

  const start = useCallback(() => {
    if (disabled || timer.current) return;
    setConfirmed(false);
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      setConfirmed(true);
      onConfirm();
    }, durationMs);
  }, [disabled, durationMs, onConfirm]);

  useEffect(() => cancel, [cancel]);

  useEffect(() => {
    if (asking) confirmButton.current?.focus();
  }, [asking]);

  if (asking) {
    return (
      <span role="group" aria-label={ariaLabel ?? label} className="inline-flex gap-2">
        <Button
          ref={confirmButton}
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => {
            setAsking(false);
            setConfirmed(true);
            onConfirm();
          }}
        >
          {t('confirmAction', { label })}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setAsking(false)}>
          {t('cancel')}
        </Button>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={t('holdToConfirm', { label: ariaLabel ?? label })}
        aria-busy={holding}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          start();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onPointerLeave={cancel}
        onKeyDown={(event) => {
          if (!HOLD_KEYS.has(event.key)) return;
          event.preventDefault();
          if (!event.repeat) start();
        }}
        onKeyUp={(event) => {
          if (HOLD_KEYS.has(event.key)) cancel();
        }}
        onClick={(event) => {
          // Screen readers and switch access activate with a synthetic click (detail 0) and
          // cannot hold; they confirm in a second explicit step instead.
          if (event.detail === 0 && !disabled && !timer.current) setAsking(true);
        }}
        onContextMenu={(event) => event.preventDefault()}
        className={cn(
          'relative inline-flex h-11 select-none items-center justify-center overflow-hidden rounded-lg border border-danger px-4 text-body-sm font-medium text-danger outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 md:h-9',
          className,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-0 origin-left bg-danger-bg motion-safe:transition-transform motion-safe:ease-linear',
            holding ? 'motion-safe:duration-(--hold-duration)' : 'motion-safe:duration-120',
          )}
          style={
            {
              transform: holding ? 'scaleX(1)' : 'scaleX(0)',
              '--hold-duration': `${durationMs}ms`,
            } as CSSProperties
          }
        />
        <span className="relative">{holding ? t('holding') : label}</span>
      </button>
      <span role="status" className="sr-only">
        {confirmed ? t('confirmed') : ''}
      </span>
    </>
  );
}
