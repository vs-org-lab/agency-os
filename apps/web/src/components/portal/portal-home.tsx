import type { ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { ClientAvatar } from '@agency-os/ui/components/client-avatar';
import { Link } from '@/i18n/navigation';
import type { ClientProjectView } from '@/modules/rooms';
import { ActionList, type PortalActionItem } from './action-list';
import { ProjectStrip } from './project-strip';
import { ResultsStrip, type StripKpi } from '@/components/results/results-strip';
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
  /** Reference material that asks nothing of the client: presentations, briefing and statuses. */
  children?: ReactNode;
};

function projectStrip(project: ClientProjectView) {
  const current =
    project.phases.find(
      (phase) => phase.status === 'in_progress' || phase.status === 'awaiting_approval',
    ) ?? null;
  const next = current?.steps.find((step) => step.status !== 'done') ?? null;
  return {
    phases: project.phases.map(({ id, name, status }) => ({ id, name, status })),
    current: current?.id ?? null,
    nextMilestone: next ? { name: next.name, dueOn: next.dueOn } : null,
  };
}

/** The portal's start: what to do, how much of the plan is left and where the work stands. */
export function PortalHome({
  client,
  contactName,
  now,
  actions,
  retainer,
  project,
  results,
  children,
}: PortalHomeProps) {
  const t = useTranslations('portal.dashboard');
  const format = useFormatter();
  const strip = project && project.phases.length > 0 ? projectStrip(project) : null;

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-8">
      <header className="flex items-center gap-4">
        {client ? <ClientAvatar id={client.id} name={client.name} size="lg" /> : null}
        <div className="flex min-w-0 flex-col">
          <h1 className="font-display text-brand-display text-text">
            {contactName ? t('greeting', { name: contactName }) : t('greetingAnonymous')}
          </h1>
          <p className="text-body-sm text-text-secondary">
            {format.dateTime(new Date(now), { dateStyle: 'full' })}
          </p>
        </div>
      </header>
      <ActionList items={actions} />
      {retainer ? <RetainerSection retainer={retainer} /> : null}
      {results ? <ResultsStrip kpis={results.kpis} currentMonth={results.currentMonth} /> : null}
      {strip && project ? (
        <section aria-labelledby="portal-project" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="portal-project" className="text-title-sm text-text">
              {t('project.title', { name: project.name })}
            </h2>
            <Link href="/portal/updates" className="text-body-sm text-link hover:underline">
              {t('project.open')}
            </Link>
          </div>
          <ProjectStrip {...strip} />
        </section>
      ) : null}
      {children}
    </div>
  );
}
