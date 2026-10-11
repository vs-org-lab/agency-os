import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@agency-os/ui/components/badge';
import { DocumentComments } from '@/components/project-documents/document-comments';
import { DocumentViewer } from '@/components/project-documents/document-viewer';
import { VersionHistory } from '@/components/project-documents/version-history';
import { ApprovalDecision } from '@/components/rooms/approval-decision';
import { requireArea } from '@/components/shell/session-guard';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { loadClientPortalDocument } from '@/modules/project-documents/server';
import { commentDocumentAction, decideDocumentAction } from '../../../document-actions';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; documentId: string }> };

/** P-03: read, comment and, when the team asks, approve or ask for changes. */
export default async function PortalDocumentPage({ params }: PageProps) {
  const { locale: requested, documentId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const document = await loadClientPortalDocument(session.claims, documentId);
  if (!document) notFound();
  const t = await getTranslations('projectDocuments');
  const addComment = async (input: { body: string; internal: boolean }) => {
    'use server';
    return commentDocumentAction({ documentId, body: input.body, internal: false });
  };

  return (
    <div className="mx-auto flex w-full max-w-240 flex-col gap-6">
      <Link href="/portal/docs" className="text-body-sm text-link hover:underline">
        {t('portal.title')}
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-title text-text">{document.title}</h1>
        <Badge variant={document.status === 'approved' ? 'default' : 'secondary'}>
          {t(`status.${document.status}`)}
        </Badge>
      </header>
      {document.pendingApprovalId && document.canDecide ? (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <p className="text-body-sm text-text">{t('portal.decideHint')}</p>
          <ApprovalDecision approvalId={document.pendingApprovalId} decide={decideDocumentAction} />
        </section>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <DocumentViewer title={document.title} version={document.version} />
        <div className="flex flex-col gap-6">
          <DocumentComments comments={document.comments} audience="portal" add={addComment} />
          {document.versions.length > 1 ? (
            <VersionHistory versions={document.versions} currentId={document.version?.id ?? null} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
