import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { ClientProjectView } from '@/modules/rooms';

export type RoomCardState = {
  projectName: string;
  phaseName: string | null;
  nextStep: string | null;
  pendingApprovals: number;
};

/**
 * P-01: the current phase and next client-visible step of the project shown, and how many
 * approvals wait for a decision across all of the client's projects.
 */
export function roomCardState(project: ClientProjectView, pendingApprovals: number): RoomCardState {
  const current =
    project.phases.find(
      (phase) => phase.status === 'in_progress' || phase.status === 'awaiting_approval',
    ) ?? null;
  const next = current?.steps.find((step) => step.status !== 'done') ?? null;
  return {
    projectName: project.name,
    phaseName: current?.name ?? null,
    nextStep: next?.name ?? null,
    pendingApprovals,
  };
}

const CARD = 'flex flex-col gap-2 rounded-lg border-2 border-text bg-surface p-4';
const LINK = 'text-body-sm text-link hover:underline';

export function RoomHomeCard({ state }: { state: RoomCardState }) {
  const t = useTranslations('portal.room');

  return (
    <section aria-labelledby="portal-room" className={CARD}>
      <h2 id="portal-room" className="text-title-sm text-text">
        {t('title', { name: state.projectName })}
      </h2>
      <p className="text-body-sm text-text">
        {state.phaseName ? t('currentPhase', { name: state.phaseName }) : t('noPhase')}
      </p>
      {state.nextStep ? (
        <p className="text-body-sm text-text-secondary">
          {t('nextStep', { name: state.nextStep })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-4">
        {state.pendingApprovals > 0 ? (
          <Link href="/portal/approvals" className={LINK}>
            {t('approvalsLink', { count: state.pendingApprovals })}
          </Link>
        ) : null}
        <Link href="/portal/updates" className={LINK}>
          {t('updatesLink')}
        </Link>
      </div>
    </section>
  );
}
