'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cmykOf, rgbOf } from './domain/color-values';

type Swatch = { name: string; hex: string; notes: string };

/** A brand colour that copies itself: the swatch copies the HEX, each row copies its value. */
export function ColorSwatch({ swatch }: { swatch: Swatch }) {
  const t = useTranslations('brandHub.view');
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hex = swatch.hex.toUpperCase();
  const values = [
    { label: 'HEX', value: hex },
    { label: 'RGB', value: rgbOf(hex) },
    { label: 'CMYK', value: cmykOf(hex) },
  ];

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1600);
  };

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-label={t('copy', { label: swatch.name, value: hex })}
        onClick={() => void copy('swatch', hex)}
        style={{ backgroundColor: hex }}
        className="group relative h-36 w-full cursor-copy rounded-[var(--hub-radius)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--hub-text)_10%,transparent)] transition-transform duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hub-accent)]"
      >
        <span
          aria-live="polite"
          className="absolute bottom-3 left-3 rounded-full bg-[color-mix(in_oklab,var(--hub-surface)_88%,transparent)] px-2 py-0.5 text-caption text-[var(--hub-text)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {copied === 'swatch' ? t('copied') : t('copyHint')}
        </span>
      </button>
      <div className="flex flex-col pt-3">
        <span className="text-body font-semibold text-[var(--hub-text)]">{swatch.name}</span>
        {swatch.notes ? (
          <span className="pb-2 text-body-sm text-[var(--hub-text-muted)]">{swatch.notes}</span>
        ) : null}
        <ul className="flex flex-col">
          {values.map((entry) => (
            <li key={entry.label}>
              <button
                type="button"
                aria-label={t('copy', { label: entry.label, value: entry.value })}
                onClick={() => void copy(entry.label, entry.value)}
                className="flex w-full cursor-copy items-center justify-between gap-3 border-t border-[var(--hub-divider)] py-2 font-mono text-caption text-[var(--hub-text)] transition-colors duration-150 hover:text-[var(--hub-accent)]"
              >
                <span className="text-[var(--hub-text-muted)]">{entry.label}</span>
                <span aria-live="polite">{copied === entry.label ? t('copied') : entry.value}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
