'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@agency-os/ui/lib/utils';

export type Pin = { id: string; number: number; x: number; y: number; resolved: boolean };

/** Numbered markers over an image or a PDF page, positioned in percent of the surface. */
export function Pins({
  pins,
  pending,
  activeId,
  onSelect,
}: {
  pins: Pin[];
  pending: { x: number; y: number } | null;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations('proofing.viewer');
  return (
    <>
      {pins.map((pin) => (
        <button
          key={pin.id}
          type="button"
          aria-label={t('pinLabel', { number: pin.number })}
          aria-pressed={activeId === pin.id}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(pin.id);
          }}
          className={cn(
            'absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-surface text-caption font-semibold shadow-md',
            pin.resolved
              ? 'bg-surface-muted text-text-secondary'
              : 'bg-primary text-primary-foreground',
            activeId === pin.id && 'ring-2 ring-ring ring-offset-2',
          )}
          style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
        >
          {pin.number}
        </button>
      ))}
      {pending ? (
        <span
          role="img"
          aria-label={t('newPin')}
          className="pointer-events-none absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-primary bg-primary/20"
          style={{ left: `${pending.x}%`, top: `${pending.y}%` }}
        />
      ) : null}
    </>
  );
}
