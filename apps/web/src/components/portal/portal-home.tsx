import type { ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { ClientAvatar } from '@agency-os/ui/components/client-avatar';
import type { PortalDocumentCardView } from '@/modules/project-documents';
import type { ClientProjectView } from '@/modules/rooms';
import { ResultsStrip, type StripKpi } from '@/components/results/results-strip';
import { ActionList, type PortalActionItem } from './action-list';
import type { GettingStartedStep } from './getting-started';
import { GettingStarted, ProjectOverview, RecentDocuments, RecentUpdates } from './home-cards';
import { PortalTour } from './portal-tour';
import { RetainerSection, type PortalRetainerHome } from './retainer-section';

export type PortalHomeProps = {
  client: { id: string; name: string } | null;
  contactName: string | null;
  /** The moment the page was rendered, as an ISO string. */
  now: string;
  actions: PortalActionItem[];
  retainer: PortalRetainerHome | null;
  /** Visible results indicators; the strip stays hidden without any. */
  results?: { kpis: readonly StripKpi[]; currentMonth: string };
  project: ClientProjectView | null;
  /** Documents shared with the client, for the "recent" list. */
  documents?: readonly PortalDocumentCardView[];
  /** The first steps, unless the client hid them. */
  gettingStarted?: { steps: readonly GettingStartedStep[]; hide: () => Promise<void> } | null;
  /** The guided tour, opened on the first visit. */
  tour?: { autoStart: boolean; onFinish: () => Promise<void> };
  /** Reference material that asks nothing of the client: presentations, briefing and statuses. */
  children?: ReactNode;
};

function summaryKey(project: ClientProjectView | null) {
  if (!project || project.phases.length === 0) return { key: 'none' as const, phase: '' };
  const current = project.phases.find(
    (phase) => phase.status === 'in_progress' || phase.status === 'awaiting_approval',
  );
  if (current) {
    return {
      key: current.status === 'awaiting_approval' ? ('waiting' as const) : ('active' as const),
      phase: current.name,
    };
  }
  const pending = project.phases.find((phase) => phase.status === 'pending');
  return pending
    ? { key: 'active' as const, phase: pending.name }
    : { key: 'done' as const, phase: '' };
}

/**
 * The portal's start, ordered by what a client opens it for: where the project stands and what
 * waits on them, then the first steps while they last, then what changed. The retainer and the
 * results follow for the clients who have them.
 */
export function PortalHome({
  client,
  contactName,
  now,
  actions,
  retainer,
  project,
  results,
  documents = [],
  gettingStarted,
  tour,
  children,
}: PortalHomeProps) {
  const t = useTranslations('portal.dashboard');
  const format = useFormatter();
  const summary = summaryKey(project);

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-5">
      <header className="flex items-center gap-4">
        {client ? <ClientAvatar id={client.id} name={client.name} size="lg" /> : null}
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-caption font-medium text-text-tertiary first-letter:uppercase">
            {format.dateTime(new Date(now), { dateStyle: 'full' })}
          </p>
          <h1 className="font-display text-brand-display text-text">
            {contactName ? t('greeting', { name: contactName }) : t('greetingAnonymous')}
          </h1>
          <p className="text-body-sm text-text-secondary">
            {t(`summary.${summary.key}`, { project: project?.name ?? '', phase: summary.phase })}
          </p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <ProjectOverview project={project} />
        <ActionList items={actions} />
      </div>

      {gettingStarted ? (
        <GettingStarted steps={gettingStarted.steps} onHide={gettingStarted.hide} />
      ) : null}

      {project || documents.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {project ? <RecentUpdates updates={project.updates} /> : null}
          {documents.length > 0 ? <RecentDocuments documents={documents} /> : null}
        </div>
      ) : null}

      {retainer ? <RetainerSection retainer={retainer} /> : null}
      {results ? <ResultsStrip kpis={results.kpis} currentMonth={results.currentMonth} /> : null}
      {children}
      {tour ? <PortalTour autoStart={tour.autoStart} onFinish={tour.onFinish} /> : null}
    </div>
  );
}
