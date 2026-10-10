'use client';

import { forwardRef } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';

/** A video proof; comments are pinned to the second the video is paused at. */
export const VideoPlayer = forwardRef<
  HTMLVideoElement,
  { src: string; title: string; canPin: boolean; onPickTime: (seconds: number) => void }
>(function VideoPlayer({ src, title, canPin, onPickTime }, ref) {
  const t = useTranslations('proofing.viewer');
  return (
    <div className="flex flex-col gap-3">
      <video
        ref={ref}
        src={src}
        controls
        preload="metadata"
        aria-label={title}
        className="max-h-[70vh] w-full rounded-md bg-black"
      />
      {canPin ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const video = typeof ref === 'object' ? ref?.current : null;
              onPickTime(Math.max(0, Math.round((video?.currentTime ?? 0) * 10) / 10));
            }}
          >
            {t('commentHere')}
          </Button>
          <span className="text-caption text-text-secondary">{t('videoHint')}</span>
        </div>
      ) : null}
    </div>
  );
});
