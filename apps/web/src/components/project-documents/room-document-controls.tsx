'use client';

import { useRouter } from '@/i18n/navigation';
import { uploadToSignedUrl } from '@/components/proofing/upload';
import type { ProjectDocumentKind } from '@agency-os/db';
import type { DocumentActions } from '@/modules/project-documents';
import { DocumentActionsBar } from './document-actions';
import type { ActionResult } from './document-errors';
import { NewDocumentForm } from './new-document-form';

type Started =
  { ok: true; versionId: string; uploadUrl: string | null } | { ok: false; code: string };

export type DocumentServerActions = {
  startDocument: (input: {
    projectId: string;
    title: string;
    kind: ProjectDocumentKind;
    url?: string;
    file?: { name: string; sizeBytes: number };
  }) => Promise<(Started & { documentId?: string }) | { ok: false; code: string }>;
  startVersion: (input: {
    documentId: string;
    url?: string;
    file?: { name: string; sizeBytes: number };
  }) => Promise<Started>;
  finishUpload: (versionId: string) => Promise<ActionResult>;
  share: (documentId: string) => Promise<ActionResult>;
  withdraw: (documentId: string) => Promise<ActionResult>;
  remove: (documentId: string) => Promise<ActionResult>;
  requestApproval: (documentId: string) => Promise<ActionResult>;
};

/**
 * Sends a started version's bytes straight to storage and asks the server to check them. A failed
 * transfer is still confirmed, so the server closes the version instead of leaving it uploading.
 */
async function completeUpload(
  started: Started,
  file: File | undefined,
  finish: (versionId: string) => Promise<ActionResult>,
): Promise<ActionResult> {
  if (!started.ok) return started;
  if (!started.uploadUrl || !file) return { ok: true };
  if (!(await uploadToSignedUrl(started.uploadUrl, file))) {
    await finish(started.versionId).catch(() => null);
    return { ok: false, code: 'upload_failed' };
  }
  return finish(started.versionId);
}

const fileInput = (file: File) => ({ name: file.name, sizeBytes: file.size });

export function NewRoomDocument({
  projectId,
  basePath,
  actions,
}: {
  projectId: string;
  basePath: string;
  actions: Pick<DocumentServerActions, 'startDocument' | 'finishUpload'>;
}) {
  return (
    <NewDocumentForm
      projectId={projectId}
      basePath={basePath}
      create={async ({ file, ...input }) => {
        const started = await actions.startDocument({
          ...input,
          ...(file ? { file: fileInput(file) } : {}),
        });
        const uploaded = await completeUpload(started, file, actions.finishUpload);
        return uploaded.ok && started.ok && 'documentId' in started
          ? { ok: true, documentId: started.documentId }
          : uploaded;
      }}
    />
  );
}

export function RoomDocumentControls({
  documentId,
  kind,
  actions,
  canWrite,
  backHref,
  serverActions,
}: {
  documentId: string;
  kind: ProjectDocumentKind;
  actions: DocumentActions;
  canWrite: boolean;
  backHref: string;
  serverActions: DocumentServerActions;
}) {
  const router = useRouter();
  return (
    <DocumentActionsBar
      documentId={documentId}
      kind={kind}
      actions={actions}
      canWrite={canWrite}
      onRemoved={() => router.push(backHref)}
      handlers={{
        share: () => serverActions.share(documentId),
        withdraw: () => serverActions.withdraw(documentId),
        requestApproval: () => serverActions.requestApproval(documentId),
        remove: () => serverActions.remove(documentId),
        changeLink: (url) =>
          serverActions
            .startVersion({ documentId, url })
            .then((started) => (started.ok ? { ok: true as const } : started)),
        replaceFile: async (file) =>
          completeUpload(
            await serverActions.startVersion({ documentId, file: fileInput(file) }),
            file,
            serverActions.finishUpload,
          ),
      }}
    />
  );
}
