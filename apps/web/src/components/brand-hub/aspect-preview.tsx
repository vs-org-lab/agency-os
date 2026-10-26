'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@agency-os/ui/lib/utils';

const ASPECTS = ['1:1', '4:5', '16:9', 'original'] as const;
type Aspect = (typeof ASPECTS)[number];

export type PreviewImage = { name: string; url: string };

const ratioOf = (aspect: Aspect) =>
  aspect === 'original' ? undefined : aspect.replace(':', ' / ');

/** Preview frames for chosen images; the selection never leaves the browser. */
export function AspectPreview({ images }: { images: PreviewImage[] }) {
  const t = useTranslations('brandHub.assets.aspect');
  const groupName = useId();
  const [aspect, setAspect] = useState<Aspect>('original');

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-caption text-text-secondary">{t('label')}</legend>
        <div className="inline-flex self-start overflow-hidden rounded-md border border-border">
          {ASPECTS.map((option) => (
            <label
              key={option}
              className={cn(
                'cursor-pointer px-3 py-1 text-body-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ring',
                aspect === option
                  ? 'bg-primary text-primary-foreground'
                  : 'text-text hover:bg-surface-muted',
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={option}
                checked={aspect === option}
                onChange={() => setAspect(option)}
                className="sr-only"
              />
              {option === 'original' ? t('original') : option}
            </label>
          ))}
        </div>
      </fieldset>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {images.map((image) => (
          <li key={image.url} className="flex flex-col gap-1">
            <div
              data-slot="aspect-frame"
              className="flex items-center justify-center overflow-hidden rounded-md border border-border bg-surface-muted"
              style={{ aspectRatio: ratioOf(aspect) }}
            >
              <img
                src={image.url}
                alt={image.name}
                className={cn(
                  'max-h-64 w-full',
                  aspect === 'original' ? 'h-auto object-contain' : 'h-full object-cover',
                )}
              />
            </div>
            <span className="truncate text-caption text-text-secondary">{image.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
