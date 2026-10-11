'use client';

import { Download, File, FileImage, FileText, FileVideo, Folder, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@agency-os/ui/components/table';
import { Link } from '@/i18n/navigation';
import type { FileView, FolderView } from '@/modules/library';

/** Images up to this size show as thumbnails in the grid; larger ones keep the icon. */
const THUMBNAIL_MAX_BYTES = 5_000_000;

const KIND_ICONS = { image: FileImage, video: FileVideo, document: FileText, other: File } as const;

export function fileHref(fileId: string): string {
  return `/api/library/files/${fileId}`;
}

export function useFileSize() {
  const format = useFormatter();
  return (bytes: number) =>
    bytes >= 1_000_000
      ? format.number(bytes / 1_000_000, {
          style: 'unit',
          unit: 'megabyte',
          maximumFractionDigits: 1,
        })
      : format.number(Math.max(1, Math.round(bytes / 1000)), { style: 'unit', unit: 'kilobyte' });
}

type ItemsProps = {
  folders: FolderView[];
  files: FileView[];
  folderLink: (folderId: string) => string;
  showVisibility: boolean;
  onDeleteFile: (file: FileView) => void;
};

function VisibilityBadge({ folder }: { folder: FolderView }) {
  const t = useTranslations('library.visibility');
  return (
    <Badge variant={folder.visibility === 'client' ? 'secondary' : 'outline'}>
      {t(folder.visibility)}
    </Badge>
  );
}

function FileActions({ file, onDelete }: { file: FileView; onDelete: (file: FileView) => void }) {
  const t = useTranslations('library');
  return (
    <div className="flex items-center gap-1">
      <Button asChild variant="ghost" size="icon-sm">
        <a href={fileHref(file.id)} aria-label={t('download', { name: file.name })}>
          <Download aria-hidden="true" />
        </a>
      </Button>
      {file.canDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('deleteFile', { name: file.name })}
          onClick={() => onDelete(file)}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

export function LibraryGrid({
  folders,
  files,
  folderLink,
  showVisibility,
  onDeleteFile,
}: ItemsProps) {
  const t = useTranslations('library');
  const size = useFileSize();
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {folders.map((folder) => (
        <li key={folder.id}>
          <Link
            href={folderLink(folder.id)}
            className="flex h-full flex-col gap-2 rounded-lg border border-border bg-surface p-3 hover:border-text focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Folder aria-hidden="true" className="size-8 text-text-secondary" />
            <span className="truncate text-label text-text">{folder.name}</span>
            <span className="text-caption text-text-secondary">
              {t('fileCount', { count: folder.fileCount })}
            </span>
            {showVisibility ? <VisibilityBadge folder={folder} /> : null}
          </Link>
        </li>
      ))}
      {files.map((file) => {
        const Icon = KIND_ICONS[file.kind];
        return (
          <li
            key={file.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
          >
            <div className="flex aspect-4/3 items-center justify-center overflow-hidden rounded-md bg-surface-muted">
              {file.kind === 'image' && file.sizeBytes <= THUMBNAIL_MAX_BYTES ? (
                <img
                  src={fileHref(file.id)}
                  alt=""
                  loading="lazy"
                  className="size-full object-contain"
                />
              ) : (
                <Icon aria-hidden="true" className="size-8 text-text-secondary" />
              )}
            </div>
            <span className="truncate text-label text-text" title={file.name}>
              {file.name}
            </span>
            <span className="text-caption text-text-secondary">
              {size(file.sizeBytes)}
              {file.folderName ? ` · ${t('inFolder', { folder: file.folderName })}` : ''}
            </span>
            <FileActions file={file} onDelete={onDeleteFile} />
          </li>
        );
      })}
    </ul>
  );
}

export function LibraryList({
  folders,
  files,
  folderLink,
  showVisibility,
  onDeleteFile,
}: ItemsProps) {
  const t = useTranslations('library');
  const format = useFormatter();
  const size = useFileSize();
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.name')}</TableHead>
            <TableHead>{t('columns.size')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('columns.date')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('columns.uploadedBy')}</TableHead>
            <TableHead>
              <span className="sr-only">{t('columns.actions')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {folders.map((folder) => (
            <TableRow key={folder.id}>
              <TableCell>
                <Link
                  href={folderLink(folder.id)}
                  className="inline-flex items-center gap-2 text-text hover:underline"
                >
                  <Folder aria-hidden="true" className="size-4 text-text-secondary" />
                  {folder.name}
                </Link>
                {showVisibility ? (
                  <span className="ml-2">
                    <VisibilityBadge folder={folder} />
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="text-text-secondary">
                {t('fileCount', { count: folder.fileCount })}
              </TableCell>
              <TableCell className="hidden md:table-cell" />
              <TableCell className="hidden md:table-cell" />
              <TableCell />
            </TableRow>
          ))}
          {files.map((file) => {
            const Icon = KIND_ICONS[file.kind];
            return (
              <TableRow key={file.id}>
                <TableCell>
                  <span className="inline-flex items-center gap-2 text-text">
                    <Icon aria-hidden="true" className="size-4 text-text-secondary" />
                    {file.name}
                  </span>
                  {file.folderName ? (
                    <span className="ml-2 text-caption text-text-secondary">
                      {t('inFolder', { folder: file.folderName })}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-text-secondary">{size(file.sizeBytes)}</TableCell>
                <TableCell className="hidden text-text-secondary md:table-cell">
                  <time dateTime={file.createdAt}>
                    {format.dateTime(new Date(file.createdAt), { dateStyle: 'medium' })}
                  </time>
                </TableCell>
                <TableCell className="hidden text-text-secondary md:table-cell">
                  {file.uploadedByName ?? ''}
                </TableCell>
                <TableCell>
                  <FileActions file={file} onDelete={onDeleteFile} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
