'use client';

import { useState, useTransition } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { FormMessage } from '@/components/forms/form-message';
import { uploadToSignedUrl } from '@/components/proofing/upload';
import { MAX_LIBRARY_BYTES } from '@/modules/library';
import type { HubEditorAsset } from '@/modules/brand-hub';
import { hubError, type ActionResult, type HubError } from './hub-errors';

export const ACCEPTED_HUB_TYPES =
  '.png,.jpg,.jpeg,.webp,.gif,.svg,.woff2,.woff,.otf,.ttf,.pdf,.zip';

export type AssetActions = {
  start: (
    hubId: string,
    file: { name: string; sizeBytes: number },
  ) => Promise<{ ok: true; assetId: string; uploadUrl: string } | { ok: false; code: string }>;
  finish: (assetId: string) => Promise<ActionResult>;
  remove: (assetId: string) => Promise<ActionResult>;
};

/** The hub's files: upload straight to storage, each verified on arrival (SEC-30), or remove one. */
export function AssetsPanel({
  hubId,
  assets,
  actions,
  onChanged,
}: {
  hubId: string;
  assets: HubEditorAsset[];
  actions: AssetActions;
  onChanged: () => void;
}) {
  const t = useTranslations('brandHub');
  const format = useFormatter();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploaded, setUploaded] = useState<number | null>(null);
  const [error, setError] = useState<HubError | null>(null);
  const [pending, startTransition] = useTransition();

  const upload = async (files: File[]) => {
    setError(null);
    setUploaded(null);
    let done = 0;
    let succeeded = 0;
    setProgress({ done, total: files.length });
    for (const file of files) {
      if (file.size <= 0 || file.size > MAX_LIBRARY_BYTES) {
        setError('invalid_input');
      } else {
        const started = await actions
          .start(hubId, { name: file.name, sizeBytes: file.size })
          .catch(() => ({ ok: false as const, code: 'upload_failed' }));
        if (!started.ok) {
          setError(hubError(started.code));
        } else {
          const sent = await uploadToSignedUrl(started.uploadUrl, file);
          const finished = await actions
            .finish(started.assetId)
            .catch(() => ({ ok: false as const, code: 'upload_failed' }));
          if (!sent) setError('upload_failed');
          else if (!finished.ok) setError(hubError(finished.code));
          else succeeded += 1;
        }
      }
      done += 1;
      setProgress({ done, total: files.length });
    }
    setProgress(null);
    setUploaded(succeeded);
    onChanged();
  };

  const remove = (assetId: string) =>
    startTransition(async () => {
      const outcome = await actions
        .remove(assetId)
        .catch(() => ({ ok: false, code: 'not_found' }) as const);
      setError(outcome.ok ? null : hubError(outcome.code));
      if (outcome.ok) onChanged();
    });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-body-sm font-medium text-text">{t('assets.title')}</h2>
      <label className="inline-flex cursor-pointer items-center gap-2 self-start rounded-md border border-border px-3 py-1.5 text-body-sm text-text hover:bg-surface-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
        <Upload aria-hidden="true" className="size-4" />
        {t('assets.upload')}
        <input
          type="file"
          multiple
          accept={ACCEPTED_HUB_TYPES}
          className="sr-only"
          disabled={progress !== null}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (files.length > 0) void upload(files);
          }}
        />
      </label>
      <p className="text-caption text-text-secondary">{t('assets.accepted')}</p>
      {progress ? (
        <p role="status" className="text-body-sm text-text-secondary">
          {t('assets.uploading', progress)}
        </p>
      ) : null}
      {uploaded !== null && uploaded > 0 ? (
        <FormMessage tone="success">{t('assets.uploaded', { count: uploaded })}</FormMessage>
      ) : null}
      {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
      {assets.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t('assets.empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {assets.map((asset) => (
            <li key={asset.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-body-sm text-text">{asset.name}</span>
                <span className="text-caption text-text-secondary">
                  {t('assets.meta', {
                    size: format.number(asset.sizeBytes / 1_048_576, { maximumFractionDigits: 1 }),
                    status: t(`assets.status.${asset.status}`),
                  })}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('assets.remove', { name: asset.name })}
                disabled={pending}
                onClick={() => remove(asset.id)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
