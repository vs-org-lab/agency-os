'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { useRouter } from '@/i18n/navigation';
import { documentError, type ActionResult, type DocumentError } from './document-errors';

type Kind = 'figma' | 'pdf' | 'file' | 'link';

export type CreateDocument = (input: {
  projectId: string;
  title: string;
  kind: Kind;
  url?: string;
  file?: File;
}) => Promise<ActionResult & { documentId?: string }>;

const KINDS: readonly Kind[] = ['figma', 'pdf', 'file', 'link'];

/** C-04 "Novo documento": a title, a type and its link or file. */
export function NewDocumentForm({
  projectId,
  basePath,
  create,
}: {
  projectId: string;
  basePath: string;
  create: CreateDocument;
}) {
  const t = useTranslations('projectDocuments');
  const te = useTranslations('projectDocuments.errors');
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Kind>('pdf');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<DocumentError | null>(null);
  const [pending, startTransition] = useTransition();
  const linkKind = kind === 'figma' || kind === 'link';

  if (!open) {
    return (
      <Button type="button" size="sm" className="self-start" onClick={() => setOpen(true)}>
        {t('newDocument')}
      </Button>
    );
  }

  return (
    <form
      aria-label={t('newDocument')}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await create({
            projectId,
            title,
            kind,
            ...(linkKind ? { url } : file ? { file } : {}),
          }).catch(() => ({ ok: false, code: 'upload_failed' }) as const);
          if (result.ok && 'documentId' in result && result.documentId) {
            router.push(`${basePath}/${result.documentId}`);
          } else if (!result.ok) {
            setError(documentError(result.code));
          }
        });
      }}
    >
      <h3 className="text-title-sm text-text">{t('newDocument')}</h3>
      <div className="flex flex-col gap-1 md:w-96">
        <Label htmlFor={`${id}-title`}>{t('documentTitle')}</Label>
        <Input
          id={`${id}-title`}
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-label text-text">{t('kind')}</legend>
        {KINDS.map((value) => (
          <label key={value} className="flex items-center gap-2 text-body-sm text-text">
            <input
              type="radio"
              name={`${id}-kind`}
              className="size-4"
              value={value}
              checked={kind === value}
              onChange={() => setKind(value)}
            />
            {t(`kinds.${value}`)}
          </label>
        ))}
      </fieldset>
      {linkKind ? (
        <div className="flex flex-col gap-1 md:w-96">
          <Label htmlFor={`${id}-url`}>{t('url')}</Label>
          <Input
            id={`${id}-url`}
            type="url"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1 md:w-96">
          <Label htmlFor={`${id}-file`}>{t('file')}</Label>
          <Input
            id={`${id}-file`}
            type="file"
            required
            accept={kind === 'pdf' ? 'application/pdf' : undefined}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </div>
      )}
      {error ? <FormMessage tone="danger">{te(error)}</FormMessage> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t('creating') : t('create')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t('actions.cancel')}
        </Button>
      </div>
    </form>
  );
}
