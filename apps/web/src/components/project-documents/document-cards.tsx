import { FileText, Link2, Paperclip, Presentation } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Link } from '@/i18n/navigation';
import type {
  DocumentCardView,
  PortalDocumentCardView,
  RoomDocumentsView,
} from '@/modules/project-documents';

const KIND_ICONS = { figma: Presentation, pdf: FileText, file: Paperclip, link: Link2 } as const;

const CARD =
  'flex h-full flex-col gap-2 rounded-lg border border-border bg-surface p-4 hover:border-text focus-visible:outline-2 focus-visible:outline-offset-2';

function StatusBadge({ status }: { status: DocumentCardView['status'] }) {
  const t = useTranslations('projectDocuments.status');
  return <Badge variant={status === 'approved' ? 'default' : 'secondary'}>{t(status)}</Badge>;
}

function DocumentCard({
  href,
  document,
  detail,
}: {
  href: string;
  document: Pick<DocumentCardView, 'title' | 'kind' | 'status'>;
  detail: string;
}) {
  const t = useTranslations('projectDocuments');
  const Icon = KIND_ICONS[document.kind];
  return (
    <Link href={href} className={CARD}>
      <span className="flex items-center gap-2 text-caption text-text-secondary">
        <Icon aria-hidden="true" className="size-4" />
        {t(`kinds.${document.kind}`)}
      </span>
      <span className="text-label text-text">{document.title}</span>
      <span className="flex flex-wrap items-center gap-2">
        <StatusBadge status={document.status} />
        <span className="text-caption text-text-secondary">{detail}</span>
      </span>
    </Link>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface-muted p-4">
      <span className="text-caption text-text-secondary">{label}</span>
      <span className="text-label text-text">{value}</span>
    </div>
  );
}

/** C-04: the project's documents, the Core presentations and the commercial states, in cards. */
export function RoomDocumentCards({
  clientId,
  view,
}: {
  clientId: string;
  view: RoomDocumentsView;
}) {
  const t = useTranslations('projectDocuments');
  const { commercial } = view;
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="project-documents-title" className="flex flex-col gap-3">
        <h3 id="project-documents-title" className="text-title-sm text-text">
          {t('cards.projectDocuments')}
        </h3>
        {view.documents.length === 0 ? (
          <p className="text-body-sm text-text-secondary">{t('empty')}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {view.documents.map((document) => (
              <li key={document.id}>
                <DocumentCard
                  href={`/c/${clientId}/docs/${document.id}`}
                  document={document}
                  detail={
                    document.version === null
                      ? t('uploadingFirst')
                      : t('version', { number: document.version })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      {view.presentations.length > 0 || commercial ? (
        <section aria-labelledby="commercial-documents-title" className="flex flex-col gap-3">
          <h3 id="commercial-documents-title" className="text-title-sm text-text">
            {t('cards.commercial')}
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {view.presentations.map((presentation) => (
              <li key={presentation.id}>
                <SummaryCard label={t('cards.presentation')} value={presentation.title} />
                <span className="sr-only">
                  {t(`cards.presentationStatus.${presentation.status}`)}
                </span>
              </li>
            ))}
            {commercial ? (
              <>
                <li>
                  <SummaryCard
                    label={t('cards.proposal')}
                    value={
                      commercial.proposal
                        ? t(`cards.proposalStatus.${commercial.proposal}`)
                        : t('cards.none')
                    }
                  />
                </li>
                <li>
                  <SummaryCard
                    label={t('cards.contract')}
                    value={
                      commercial.contract
                        ? t(`cards.contractStatus.${commercial.contract}`)
                        : t('cards.none')
                    }
                  />
                </li>
                <li>
                  <SummaryCard
                    label={t('cards.invoices')}
                    value={t(`cards.invoicesState.${commercial.invoices}`)}
                  />
                </li>
              </>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** P-03 list: the documents shared with the client. */
export function PortalDocumentCards({ documents }: { documents: PortalDocumentCardView[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {documents.map((document) => (
        <li key={document.id}>
          <DocumentCard
            href={`/portal/docs/${document.id}`}
            document={document}
            detail={document.projectName}
          />
        </li>
      ))}
    </ul>
  );
}
