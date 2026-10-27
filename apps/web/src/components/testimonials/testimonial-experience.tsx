'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@agency-os/ui/components/tabs';
import type { TestimonialInput, TestimonialView } from '@/modules/testimonials';
import { TestimonialForm } from './testimonial-form';
import { TestimonialVideoForm, type TestimonialVideoActions } from './testimonial-video-form';

type SendResult = { ok: true } | { ok: false; code: string };

/** The testimonial page: record a video by default, or write it instead. */
export function TestimonialExperience({
  projectId,
  projectName,
  initial,
  send,
  videoActions,
}: {
  projectId: string;
  projectName: string;
  initial: TestimonialView | null;
  send: (input: TestimonialInput) => Promise<SendResult>;
  videoActions: TestimonialVideoActions;
}) {
  const t = useTranslations('testimonials.mode');
  const [mode, setMode] = useState<'video' | 'write'>('video');

  return (
    <Tabs value={mode} onValueChange={(value) => setMode(value === 'write' ? 'write' : 'video')}>
      <TabsList aria-label={t('label')}>
        <TabsTrigger value="video">{t('video')}</TabsTrigger>
        <TabsTrigger value="write">{t('write')}</TabsTrigger>
      </TabsList>
      <TabsContent value="video" className="pt-4">
        <TestimonialVideoForm
          projectId={projectId}
          initial={initial}
          actions={videoActions}
          onWriteInstead={() => setMode('write')}
        />
      </TabsContent>
      <TabsContent value="write" className="pt-4">
        <TestimonialForm
          projectId={projectId}
          projectName={projectName}
          initial={initial}
          send={send}
        />
      </TabsContent>
    </Tabs>
  );
}
