import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@agency-os/ui/components/badge';
import { DocumentComments } from '@/components/project-documents/document-comments';
import { DocumentViewer } from '@/components/project-documents/document-viewer';
import { RoomDocumentControls } from '@/components/project-documents/room-document-controls';
import { VersionHistory } from '@/components/project-documents/version-history';
import { requireArea } from '@/components/shell/session-guard';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { loadRoomDocument } from '@/modules/project-documents/server';
import {
  commentDocumentAction,
  finishDocumentUploadAction,
  removeDocumentAction,
  requestDocumentApprovalAction,
  shareDocumentAction,
  startDocumentAction,
  startVersionAction,
  withdrawDocumentAction,
} from '../../../../document-actions';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; clientId: string; documentId: string }> };

/** C-05: a document with its viewer, comments, actions and versions. */
export default async function RoomDocumentPage({ params }: PageProps) {
  const { locale: requested, clientId, documentId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const document = await loadRoomDocument(session.claims, documentId);
  if (!document || document.clientId !== clientId) notFound();
  const t = await getTranslations('projectDocuments');
  const backHref = `/c/${clientId}/docs?project=${document.projectId}`;
  const addComment = async (input: { body: string; internal: boolean }) => {
    'use server';
    return commentDocumentAction({ documentId, ...input });
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <Link href={backHref} className="text-body-sm text-link hover:underline">
        {t('title')}
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-title text-text">{document.title}</h1>
        <Badge variant={document.status === 'approved' ? 'default' : 'secondary'}>
          {t(`status.${document.status}`)}
        </Badge>
        <span className="text-caption text-text-secondary">{t(`kinds.${document.kind}`)}</span>
      </header>
      {document.pendingApprovalId ? (
        <p className="text-body-sm text-text-secondary">{t('pendingApproval')}</p>
      ) : null}
      {document.lastDecision ? (
        <p className="text-body-sm text-text-secondary">
          {t(`lastDecision.${document.lastDecision.status}`, {
            comment: document.lastDecision.comment ?? '',
          })}
        </p>
      ) : null}
      <RoomDocumentControls
        documentId={document.id}
        kind={document.kind}
        actions={document.actions}
        canWrite={document.canWrite}
        backHref={backHref}
        serverActions={{
          startDocument: startDocumentAction,
          startVersion: startVersionAction,
          finishUpload: finishDocumentUploadAction,
          share: shareDocumentAction,
          withdraw: withdrawDocumentAction,
          remove: removeDocumentAction,
          requestApproval: requestDocumentApprovalAction,
        }}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <DocumentViewer title={document.title} version={document.current} />
        <div className="flex flex-col gap-6">
          <DocumentComments comments={document.comments} audience="staff" add={addComment} />
          <VersionHistory versions={document.versions} currentId={document.current?.id ?? null} />
        </div>
      </div>
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'projectDocuments.title');
}
