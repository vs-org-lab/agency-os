'use client';

import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Button, buttonVariants } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { cn } from '@agency-os/ui/lib/utils';
import { FileText, Image, Library, Upload, Video, X } from 'lucide-react';
import { DropLayer } from '@/components/library/drop-layer';
import {
  uploadFiles,
  type ActionResult,
  type StartUploads,
} from '@/components/library/upload-files';
import { CreateDialog } from '@/components/ui/create-dialog';
import { notify } from '@/components/ui/notify';
import type { AttachableFile } from '@/modules/library';
import type { TaskDetail } from '@/modules/tasks';
import { taskError, type TaskActionResult } from './task-errors';
import { useTaskAction } from './use-task-action';

export type TaskFileActions = {
  attachFile: (taskId: string, libraryFileId: string) => Promise<TaskActionResult>;
  detachFile: (taskId: string, libraryFileId: string) => Promise<TaskActionResult>;
  uploadFolder: (
    taskId: string,
  ) => Promise<{ ok: true; folderId: string } | { ok: false; code: string }>;
  startUploads: StartUploads;
  finishUpload: (fileId: string) => Promise<ActionResult>;
};

function FileIcon({ mimeType }: { mimeType: string | null }) {
  const className = 'size-4 shrink-0 text-text-secondary';
  if (mimeType?.startsWith('image/')) return <Image aria-hidden className={className} />;
  if (mimeType?.startsWith('video/')) return <Video aria-hidden className={className} />;
  return <FileText aria-hidden className={className} />;
}

function LibraryPicker({
  taskId,
  files,
  attachFile,
  onDone,
}: {
  taskId: string;
  files: readonly AttachableFile[];
  attachFile: TaskFileActions['attachFile'];
  onDone: () => void;
}) {
  const t = useTranslations('tasks.panel.files');
  const id = useId();
  const { run, pending } = useTaskAction();
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const shown = needle ? files.filter((file) => file.name.toLowerCase().includes(needle)) : files;

  if (files.length === 0) {
    return <p className="text-body-sm text-text-secondary">{t('noneAvailable')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-filter`}>{t('filter')}</Label>
        <Input
          id={`${id}-filter`}
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {shown.map((file) => (
          <li key={file.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm text-text">{file.name}</span>
              <span className="block truncate text-caption text-text-secondary">
                {file.folderName}
              </span>
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              aria-label={t('attach', { name: file.name })}
              onClick={async () => {
                if (await run(() => attachFile(taskId, file.id))) onDone();
              }}
            >
              {t('attachShort')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Files of the task, kept in the library of its project: linked from the library, or uploaded into
 * the project's "Tarefas" folder and linked. Dropping files anywhere in `children` uploads them.
 */
export function TaskFiles({
  task,
  attachable,
  actions,
  children,
}: {
  task: TaskDetail;
  attachable: readonly AttachableFile[];
  actions: TaskFileActions;
  children: ReactNode;
}) {
  const t = useTranslations('tasks.panel.files');
  const te = useTranslations('tasks.errors');
  const id = useId();
  const { run, pending } = useTaskAction();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const hasProject = task.projectId !== null;
  const linked = new Set(task.files.map((file) => file.id));
  const available = attachable.filter((file) => !linked.has(file.id));

  const uploadAndLink = async (files: File[]) => {
    if (!hasProject || files.length === 0 || progress) return;
    const folder = await actions.uploadFolder(task.id).catch(() => null);
    if (!folder?.ok) {
      notify.error(
        folder?.code === 'invalid_input'
          ? t('uploadFolderShared')
          : te(taskError(folder?.code ?? 'not_found')),
      );
      return;
    }
    const fileIds: string[] = [];
    setProgress({ done: 0, total: files.length });
    const outcome = await uploadFiles(
      folder.folderId,
      files,
      {
        startUploads: async (folderId, list) => {
          const started = await actions.startUploads(folderId, list);
          if (started.ok) fileIds.push(...started.uploads.map((upload) => upload.fileId));
          return started;
        },
        finishUpload: actions.finishUpload,
      },
      (done, total) => setProgress({ done, total }),
    );
    // A transfer that failed is not ready in the library, so linking it is refused and skipped.
    await Promise.all(
      fileIds.map((fileId) => actions.attachFile(task.id, fileId).catch(() => null)),
    );
    setProgress(null);
    if (outcome.error || outcome.rejected > 0) notify.error(t('uploadFailed'));
  };

  return (
    <DropLayer
      enabled={hasProject}
      onFiles={(files) => void uploadAndLink(files)}
      label={t('dropHere')}
      folderNotice={t('dropFolders')}
    >
      <div className="flex flex-col gap-6">
        <section aria-labelledby="task-files-heading" className="flex flex-col gap-2">
          <h3 id="task-files-heading" className="text-label text-text">
            {t('heading')}
          </h3>
          {!hasProject ? (
            <p className="text-body-sm text-text-secondary">{t('noProject')}</p>
          ) : (
            <>
              {task.files.length === 0 ? (
                <p className="text-body-sm text-text-secondary">{t('none')}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {task.files.map((file) => (
                    <li key={file.id} className="flex items-center gap-2">
                      <FileIcon mimeType={file.mimeType} />
                      <a
                        href={`/api/library/files/${file.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 truncate text-body-sm text-link hover:underline"
                      >
                        {file.name}
                      </a>
                      {file.canDetach ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          aria-label={t('detach', { name: file.name })}
                          onClick={() => void run(() => actions.detachFile(task.id, file.id))}
                        >
                          <X aria-hidden />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {progress ? (
                <p role="status" className="text-caption text-text-secondary">
                  {t('uploading', progress)}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <CreateDialog
                  label={t('add')}
                  title={t('chooseTitle')}
                  icon={<Library aria-hidden />}
                  variant="outline"
                >
                  {(close) => (
                    <LibraryPicker
                      taskId={task.id}
                      files={available}
                      attachFile={actions.attachFile}
                      onDone={() => close({ message: t('attached') })}
                    />
                  )}
                </CreateDialog>
                <label
                  htmlFor={`${id}-upload`}
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'cursor-pointer focus-within:outline-2',
                    progress && 'opacity-60',
                  )}
                >
                  <Upload aria-hidden />
                  {t('upload')}
                  <input
                    id={`${id}-upload`}
                    type="file"
                    multiple
                    className="sr-only"
                    disabled={progress !== null}
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      event.target.value = '';
                      void uploadAndLink(files);
                    }}
                  />
                </label>
              </div>
            </>
          )}
        </section>
        {children}
      </div>
    </DropLayer>
  );
}
