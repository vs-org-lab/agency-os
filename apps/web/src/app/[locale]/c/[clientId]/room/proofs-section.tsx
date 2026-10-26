'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { CreateDialog } from '@/components/ui/create-dialog';
import {
  proofError,
  type ProofActionResult,
  type ProofError,
} from '@/components/proofing/proof-errors';
import { RevisionLimitForm } from '@/components/proofing/revision-limit-form';
import {
  ACCEPTED_PROOF_TYPES,
  MAX_PROOF_UPLOAD_BYTES,
  uploadToSignedUrl,
} from '@/components/proofing/upload';
import { Link } from '@/i18n/navigation';
import type { ProofFileView, ProofVersionSummary, RoundsStatus } from '@/modules/proofing';

type StartUpload = (
  ...args: string[]
) => Promise<{ ok: true; versionId: string; uploadUrl: string } | { ok: false; code: string }>;

export type ProofsActions = {
  start: (projectId: string, title: string) => ReturnType<StartUpload>;
  newVersion: (fileId: string) => ReturnType<StartUpload>;
  finish: (versionId: string) => Promise<ProofActionResult>;
  request: (versionId: string) => Promise<ProofActionResult>;
  withdraw: (approvalId: string) => Promise<ProofActionResult>;
  saveLimit: (projectId: string, limit: number) => Promise<ProofActionResult>;
};

type Outcome =
  { ok: true; key: 'uploaded' | 'requested' } | { ok: false; error: ProofError } | null;

function useProofAction() {
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, startTransition] = useTransition();
  const run = (key: 'uploaded' | 'requested', action: () => Promise<ProofActionResult>) =>
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false, code: 'not_found' }) as const);
      setOutcome(result.ok ? { ok: true, key } : { ok: false, error: proofError(result.code) });
    });
  return { outcome, setOutcome, pending, run };
}

/**
 * Starts a version, sends the bytes straight to storage and asks the server to check them. A
 * failed upload is still checked, so the server closes the version instead of leaving it
 * uploading.
 */
async function uploadVersion(
  start: () => ReturnType<StartUpload>,
  file: File,
  finish: (versionId: string) => Promise<ProofActionResult>,
): Promise<ProofActionResult> {
  if (file.size > MAX_PROOF_UPLOAD_BYTES) return { ok: false, code: 'invalid_file' };
  const started = await start();
  if (!started.ok) return started;
  if (!(await uploadToSignedUrl(started.uploadUrl, file))) {
    await finish(started.versionId).catch(() => null);
    return { ok: false, code: 'upload_failed' };
  }
  return finish(started.versionId);
}

function OutcomeMessage({
  outcome,
  hideSuccess = false,
}: {
  outcome: Outcome;
  hideSuccess?: boolean;
}) {
  const t = useTranslations('proofing');
  if (outcome?.ok === false)
    return <FormMessage tone="danger">{t(`errors.${outcome.error}`)}</FormMessage>;
  if (outcome?.ok && !hideSuccess)
    return <FormMessage tone="success">{t(`section.${outcome.key}`)}</FormMessage>;
  return null;
}

function statusKey(version: ProofVersionSummary) {
  if (version.status !== 'ready') return version.status;
  return version.approval?.status ?? 'noRequest';
}

function NewFileForm({
  projectId,
  actions,
  onDone,
}: {
  projectId: string;
  actions: ProofsActions;
  onDone?: (message: string) => void;
}) {
  const t = useTranslations('proofing.section');
  const id = useId();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const { outcome, setOutcome, pending, run } = useProofAction();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!file) return;
        run('uploaded', async () => {
          const result = await uploadVersion(
            () => actions.start(projectId, title),
            file,
            actions.finish,
          );
          if (result.ok) {
            setTitle('');
            setFile(null);
            event.currentTarget?.reset();
            onDone?.(t('uploaded'));
          }
          return result;
        });
      }}
      onChange={() => setOutcome(null)}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-title`}>{t('fileTitle')}</Label>
        <Input
          id={`${id}-title`}
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-file`}>{t('file')}</Label>
        <Input
          id={`${id}-file`}
          type="file"
          required
          accept={ACCEPTED_PROOF_TYPES}
          aria-describedby={`${id}-hint`}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </div>
      <Button type="submit" disabled={pending || !file}>
        {pending ? t('uploading') : t('upload')}
      </Button>
      <p id={`${id}-hint`} className="text-caption text-text-secondary">
        {t('fileHint')}
      </p>
      <div>
        <OutcomeMessage outcome={outcome} hideSuccess={Boolean(onDone)} />
      </div>
    </form>
  );
}

function FileCard({
  clientId,
  file,
  writable,
  actions,
}: {
  clientId: string;
  file: ProofFileView;
  writable: boolean;
  actions: ProofsActions;
}) {
  const t = useTranslations('proofing');
  const id = useId();
  const { outcome, setOutcome, pending, run } = useProofAction();
  const current = file.versions[0];
  // The server accepts requests on the latest ready version; uploads in progress do not count.
  const latestReady = file.versions.find((version) => version.status === 'ready');
  const canRequest = writable && latestReady && latestReady.approval?.status !== 'pending';

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="truncate text-title-sm text-text">{file.title}</h3>
          {current ? (
            <p className="flex flex-wrap items-center gap-2 text-caption text-text-secondary">
              <span>{t('section.version', { number: current.number })}</span>
              <Badge variant="secondary">{t(`status.${statusKey(current)}`)}</Badge>
              <span>{t('section.openComments', { count: current.openComments })}</span>
            </p>
          ) : null}
        </div>
        {latestReady ? (
          <Link
            href={`/c/${clientId}/proofs/${latestReady.id}`}
            className="text-body-sm text-link hover:underline"
          >
            {t('section.open')}
          </Link>
        ) : null}
      </div>
      {writable ? (
        <div className="flex flex-wrap items-center gap-2">
          {canRequest ? (
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => run('requested', () => actions.request(latestReady.id))}
            >
              {t('section.requestApproval')}
            </Button>
          ) : null}
          {latestReady?.approval?.status === 'pending' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run('requested', () => actions.withdraw(latestReady.approval?.id ?? ''))
              }
            >
              {t('section.withdraw')}
            </Button>
          ) : null}
          <Label htmlFor={`${id}-version`} className="sr-only">
            {t('section.newVersion')}
          </Label>
          <Input
            id={`${id}-version`}
            type="file"
            accept={ACCEPTED_PROOF_TYPES}
            className="max-w-64"
            disabled={pending}
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              setOutcome(null);
              if (chosen) {
                run('uploaded', () =>
                  uploadVersion(() => actions.newVersion(file.id), chosen, actions.finish),
                );
              }
            }}
          />
          <span className="text-caption text-text-secondary">{t('section.newVersion')}</span>
        </div>
      ) : null}
      <OutcomeMessage outcome={outcome} />
    </li>
  );
}

/** The room's "Para aprovação": files of the project, their latest version and its request. */
export function ProofsSection({
  clientId,
  projectId,
  files,
  rounds,
  writable,
  actions,
}: {
  clientId: string;
  projectId: string;
  files: ProofFileView[];
  rounds: RoundsStatus;
  writable: boolean;
  actions: ProofsActions;
}) {
  const t = useTranslations('proofing.section');
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-body-sm text-text-secondary">{t('description')}</p>
          <p className="text-caption text-text-secondary">
            {t('rounds', { used: rounds.used, limit: rounds.limit })}
          </p>
        </div>
        {writable ? (
          <RevisionLimitForm projectId={projectId} limit={rounds.limit} save={actions.saveLimit} />
        ) : null}
      </div>
      {writable ? (
        <div>
          <CreateDialog label={t('newFile')} title={t('newFile')}>
            {(close) => (
              <NewFileForm
                projectId={projectId}
                actions={actions}
                onDone={(message) => close({ message })}
              />
            )}
          </CreateDialog>
        </div>
      ) : null}
      {files.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {files.map((file) => (
            <FileCard
              key={file.id}
              clientId={clientId}
              file={file}
              writable={writable}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
