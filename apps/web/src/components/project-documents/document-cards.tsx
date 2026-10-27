import type { ReactNode } from 'react';
import {
  File,
  FileText,
  Link2,
  PenLine,
  Presentation,
  Receipt,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { cn } from '@agency-os/ui/lib/utils';
import { Link } from '@/i18n/navigation';
import type {
  DocumentCardView,
  PortalDocumentCardView,
  RoomDocumentsView,
} from '@/modules/project-documents';

const KIND_ICONS = {
  figma: { icon: Presentation, name: 'presentation' },
  pdf: { icon: FileText, name: 'file-text' },
  file: { icon: File, name: 'file' },
  link: { icon: Link2, name: 'link' },
} as const;

type Tone = 'neutral' | 'info' | 'success' | 'warning';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'text-neutral',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
};

const DOCUMENT_TONE: Record<DocumentCardView['status'], Tone> = {
  draft: 'neutral',
  with_client: 'info',
  approved: 'success',
};

const PROPOSAL_TONE = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  withdrawn: 'neutral',
} as const;
const CONTRACT_TONE = { awaiting_signatures: 'info', signed: 'success', void: 'neutral' } as const;
const INVOICES_TONE = { none: 'neutral', open: 'warning', paid: 'success' } as const;

const CARD =
  'rd-lift group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors duration-[120ms] hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2';

/** The cover's mono label: the format a client would recognise. */
const KIND_COVER = { figma: 'FIG', pdf: 'PDF', file: 'FILE', link: 'URL' } as const;

function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <Badge variant="outline" className="gap-1.5">
      <span
        aria-hidden="true"
        className={cn('size-1.5 rounded-full bg-current', TONE_CLASS[tone])}
      />
      {children}
    </Badge>
  );
}

function CardIcon({ icon: Icon, name }: { icon: LucideIcon; name: string }) {
  return (
    <span className="flex size-9 items-center justify-center rounded-md bg-surface-muted text-text-secondary">
      <Icon aria-hidden="true" data-icon={name} className="size-4" />
    </span>
  );
}

/** A page sketch behind the kind icon, standing in for a thumbnail. */
function DocumentCover({ icon: Icon, name }: { icon: LucideIcon; name: string }) {
  return (
    <span className="relative flex h-[62%] aspect-[3/4] flex-col gap-1.5 rounded-sm border border-border bg-surface p-3 shadow-sm transition-transform duration-300 ease-out group-hover:-translate-y-1">
      <span aria-hidden="true" className="h-1 w-2/3 rounded-full bg-border-strong" />
      <span aria-hidden="true" className="h-1 w-full rounded-full bg-border" />
      <span aria-hidden="true" className="h-1 w-5/6 rounded-full bg-border" />
      <Icon
        aria-hidden="true"
        data-icon={name}
        className="absolute right-2.5 bottom-2.5 size-4 text-text-secondary"
      />
    </span>
  );
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
  const { icon, name } = KIND_ICONS[document.kind];
  const source = [t(`kinds.${document.kind}`), detail].join(' · ');
  return (
    <Link href={href} className={CARD}>
      <span className="relative flex aspect-[16/10] items-center justify-center border-b border-border bg-surface-muted">
        <DocumentCover icon={icon} name={name} />
        <span
          aria-hidden="true"
          className="absolute top-3 left-3 font-mono text-[10px] font-medium tracking-[0.14em] text-text-muted"
        >
          {KIND_COVER[document.kind]}
        </span>
        <span className="absolute top-2.5 right-2.5">
          <StatusBadge tone={DOCUMENT_TONE[document.status]}>
            {t(`status.${document.status}`)}
          </StatusBadge>
        </span>
      </span>
      <span className="flex flex-col gap-1 p-4">
        <span className="truncate text-label text-text">{document.title}</span>
        <span className="text-caption text-text-secondary">{source}</span>
      </span>
    </Link>
  );
}

function CommercialCard({
  icon,
  iconName,
  label,
  status,
  tone,
  source,
}: {
  icon: LucideIcon;
  iconName: string;
  label: string;
  status: string;
  tone: Tone;
  source: string;
}) {
  return (
    <li aria-label={label} className="flex items-center gap-3 px-4 py-3.5">
      <CardIcon icon={icon} name={iconName} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-label text-text">{label}</span>
        <span className="text-caption text-text-secondary">{source}</span>
      </span>
      <StatusBadge tone={tone}>{status}</StatusBadge>
    </li>
  );
}

/** C-04: the commercial row first, then the project's documents as cards. */
export function RoomDocumentCards({
  clientId,
  view,
  createAction,
}: {
  clientId: string;
  view: RoomDocumentsView;
  /** The create control shown when the project has no documents yet. */
  createAction?: ReactNode;
}) {
  const t = useTranslations('projectDocuments');
  const { commercial } = view;
  return (
    <div className="flex flex-col gap-6">
      {view.presentations.length > 0 || commercial ? (
        <section aria-labelledby="commercial-documents-title" className="flex flex-col gap-3">
          <h3 id="commercial-documents-title" className="text-title-sm text-text">
            {t('cards.commercial')}
          </h3>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {view.presentations.map((presentation) => (
              <CommercialCard
                key={presentation.id}
                icon={Presentation}
                iconName="presentation"
                label={presentation.title}
                status={t(`cards.presentationStatus.${presentation.status}`)}
                tone={presentation.status === 'with_client' ? 'info' : 'neutral'}
                source={t('cards.presentation')}
              />
            ))}
            {commercial ? (
              <>
                <CommercialCard
                  icon={FileText}
                  iconName="file-text"
                  label={t('cards.proposal')}
                  status={
                    commercial.proposal
                      ? t(`cards.proposalStatus.${commercial.proposal}`)
                      : t('cards.none')
                  }
                  tone={commercial.proposal ? PROPOSAL_TONE[commercial.proposal] : 'neutral'}
                  source={t('cards.sourceDeal')}
                />
                <CommercialCard
                  icon={PenLine}
                  iconName="pen-line"
                  label={t('cards.contract')}
                  status={
                    commercial.contract
                      ? t(`cards.contractStatus.${commercial.contract}`)
                      : t('cards.none')
                  }
                  tone={commercial.contract ? CONTRACT_TONE[commercial.contract] : 'neutral'}
                  source={t('cards.sourceDeal')}
                />
                <CommercialCard
                  icon={Receipt}
                  iconName="receipt"
                  label={t('cards.invoices')}
                  status={t(`cards.invoicesState.${commercial.invoices}`)}
                  tone={INVOICES_TONE[commercial.invoices]}
                  source={t('cards.sourcePayments')}
                />
              </>
            ) : null}
          </ul>
        </section>
      ) : null}
      <section aria-labelledby="project-documents-title" className="flex flex-col gap-3">
        <h3 id="project-documents-title" className="text-title-sm text-text">
          {t('cards.projectDocuments')}
        </h3>
        {view.documents.length === 0 ? (
          <EmptyState
            title={t('empty')}
            description={createAction ? t('emptyHint') : undefined}
            icon={<FileText aria-hidden="true" />}
            action={createAction}
          />
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
