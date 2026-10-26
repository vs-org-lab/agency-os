'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@agency-os/ui/components/hover-card';
import { FileText, Image, Video } from 'lucide-react';
import type { TaskFilePreview, TaskView } from '@/modules/tasks';

const OPEN_DELAY_MS = 300;
const MAX_FILES = 3;
// Signed thumbnail links last 15 minutes; a preview older than this is fetched again.
const PREVIEW_MAX_AGE_MS = 10 * 60 * 1000;

type Preview =
  { status: 'idle' | 'loading' | 'failed' } | { status: 'ready'; files: TaskFilePreview[] };

function TypeIcon({ mimeType }: { mimeType: string | null }) {
  const className = 'size-5 text-text-secondary';
  if (mimeType?.startsWith('image/')) return <Image aria-hidden className={className} />;
  if (mimeType?.startsWith('video/')) return <Video aria-hidden className={className} />;
  return <FileText aria-hidden className={className} />;
}

/**
 * Shows up to three files of the task when the pointer rests on `children`. The card never opens
 * from keyboard focus or touch, where the side panel is the way to the files; the files and the
 * signed thumbnail links are requested only when the card opens.
 */
export function TaskFilesPreview({
  task,
  loadPreview,
  children,
}: {
  task: Pick<TaskView, 'id' | 'title' | 'fileCount'>;
  loadPreview: (
    taskId: string,
  ) => Promise<{ ok: true; files: TaskFilePreview[] } | { ok: false; code: string }>;
  children: ReactNode;
}) {
  const t = useTranslations('tasks.preview');
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview>({ status: 'idle' });
  // Radix opens on focus too; only a pointer that is over the trigger is allowed to open it.
  const overTrigger = useRef(false);
  const loadedAt = useRef(0);

  if (task.fileCount === 0) return <>{children}</>;

  const load = async () => {
    setPreview({ status: 'loading' });
    const result = await loadPreview(task.id).catch(() => null);
    loadedAt.current = Date.now();
    setPreview(
      result?.ok
        ? { status: 'ready', files: result.files.slice(0, MAX_FILES) }
        : { status: 'failed' },
    );
  };

  return (
    <HoverCard
      open={open}
      openDelay={OPEN_DELAY_MS}
      closeDelay={100}
      onOpenChange={(next) => {
        if (next && !overTrigger.current) return;
        setOpen(next);
        if (
          next &&
          (preview.status !== 'ready' || Date.now() - loadedAt.current > PREVIEW_MAX_AGE_MS)
        ) {
          void load();
        }
      }}
    >
      <HoverCardTrigger asChild>
        <span
          className="min-w-0"
          onPointerEnter={(event) => {
            overTrigger.current = event.pointerType !== 'touch';
          }}
          onPointerLeave={() => {
            overTrigger.current = false;
          }}
        >
          {children}
        </span>
      </HoverCardTrigger>
      <HoverCardContent>
        {preview.status === 'ready' ? (
          <div className="flex flex-col gap-2">
            <ul aria-label={t('label', { title: task.title })} className="flex flex-col gap-2">
              {preview.files.map((file) => (
                <li key={file.id} className="flex items-center gap-2">
                  {file.url ? (
                    <img
                      src={file.url}
                      alt=""
                      loading="lazy"
                      className="size-10 shrink-0 rounded-sm border border-border object-cover"
                    />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-surface-muted">
                      <TypeIcon mimeType={file.mimeType} />
                    </span>
                  )}
                  <span className="min-w-0 truncate text-body-sm text-text">{file.name}</span>
                </li>
              ))}
            </ul>
            {task.fileCount > preview.files.length ? (
              <p className="text-caption text-text-secondary">
                {t('more', { count: task.fileCount - preview.files.length })}
              </p>
            ) : null}
          </div>
        ) : (
          <p role="status" className="text-body-sm text-text-secondary">
            {preview.status === 'failed' ? t('failed') : t('loading')}
          </p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
