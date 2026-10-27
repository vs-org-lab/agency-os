'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { TimeScrubber } from '@agency-os/ui/components/time-scrubber';
import { usePlayback } from '@/components/media/use-playback';
import type { TeamTestimonial } from '@/modules/testimonials';

function TestimonialVideo({ video }: { video: NonNullable<TeamTestimonial['video']> }) {
  const t = useTranslations('testimonials.team');
  const tRecorder = useTranslations('media.recorder');
  const playback = usePlayback<HTMLVideoElement>();

  return (
    <div className="flex flex-col gap-3">
      <video
        src={video.url}
        controls
        playsInline
        preload="metadata"
        aria-label={t('video')}
        {...playback.mediaProps}
        className="aspect-video w-full rounded-lg bg-black"
      />
      {video.chapters.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-caption font-medium text-text-secondary">{t('chapters')}</span>
          <TimeScrubber
            label={tRecorder('position')}
            value={playback.time}
            duration={video.durationSeconds}
            onValueChange={playback.seek}
            markers={video.chapters.map((chapter) => ({
              time: chapter.startedAtMs / 1000,
              label: tRecorder('chapter', { index: chapter.index + 1 }),
            }))}
          />
        </div>
      ) : null}
    </div>
  );
}

/** The client's testimonial for the project: the video with a jump to each answer, or the text. */
export function TestimonialSection({ testimonial }: { testimonial: TeamTestimonial | null }) {
  const t = useTranslations('testimonials.team');
  if (!testimonial) return <EmptyState title={t('title')} description={t('empty')} />;

  return (
    <section aria-label={t('title')} className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-title-sm text-text">
          {t('author', { name: testimonial.authorName, role: testimonial.authorRole })}
        </h2>
        <Badge variant="secondary">
          {testimonial.consentPublish ? t('publish') : t('internal')}
        </Badge>
      </header>
      {testimonial.video ? <TestimonialVideo video={testimonial.video} /> : null}
      {testimonial.body !== '' ? (
        <div className="flex flex-col gap-1">
          {testimonial.video ? (
            <span className="text-caption font-medium text-text-secondary">{t('written')}</span>
          ) : null}
          <p className="text-body whitespace-pre-line text-text">{testimonial.body}</p>
        </div>
      ) : null}
    </section>
  );
}
