'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import type { ClientProjectView } from '@/modules/rooms';
import { ApprovalDecision, type DecideApproval } from './approval-decision';
import { UpdateFeed } from './update-feed';

/**
 * The room as the client sees it: the process with its client-visible steps, approvals and the
 * feed. The portal and "Ver como cliente" render the same component over the same data.
 */
export function ClientRoom({
  project,
  decide,
}: {
  project: ClientProjectView;
  /** The decision action; only the client's decision maker gets one. */
  decide?: DecideApproval;
}) {
  const t = useTranslations('rooms');
  const format = useFormatter();
  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: 'medium' });

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="client-room-process" className="flex flex-col gap-3">
        <h2 id="client-room-process" className="text-title-sm text-text">
          {project.name}
        </h2>
        <ol className="flex flex-col gap-3">
          {project.phases.map((phase) => (
            <li
              key={phase.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body font-medium text-text">
                  {t('phaseLabel', { position: phase.position, name: phase.name })}
                </span>
                <Badge variant={phase.status === 'done' ? 'secondary' : 'outline'}>
                  {t(`phaseStatus.${phase.status}`)}
                </Badge>
              </div>
              {phase.steps.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {phase.steps.map((step) => (
                    <li key={step.id} className="flex flex-wrap items-center gap-2 text-body-sm">
                      <span className="text-text">{step.name}</span>
                      <span className="text-text-secondary">{t(`stepStatus.${step.status}`)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {project.approvals.length > 0 ? (
        <section aria-labelledby="client-room-approvals" className="flex flex-col gap-3">
          <h2 id="client-room-approvals" className="text-title-sm text-text">
            {t('approvals')}
          </h2>
          <ul className="flex flex-col gap-3">
            {project.approvals.map((approval) => (
              <li
                key={approval.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
              >
                <span className="text-body font-medium text-text">{approval.phaseName}</span>
                <span className="text-body-sm text-text-secondary">
                  {t(`approval.${approval.status === 'withdrawn' ? 'pending' : approval.status}`, {
                    date: day(approval.decidedAt ?? approval.requestedAt),
                  })}
                </span>
                {approval.comment ? (
                  <p className="whitespace-pre-line text-body-sm text-text">{approval.comment}</p>
                ) : null}
                {approval.status === 'pending' && decide ? (
                  <ApprovalDecision approvalId={approval.id} decide={decide} />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="client-room-updates" className="flex flex-col gap-3">
        <h2 id="client-room-updates" className="text-title-sm text-text">
          {t('updates.title')}
        </h2>
        <UpdateFeed updates={project.updates} />
      </section>
    </div>
  );
}
