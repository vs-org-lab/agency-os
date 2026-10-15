'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { ApprovalDecision, type DecideApproval } from '@/components/rooms/approval-decision';
import { Link } from '@/i18n/navigation';
import type { ClientPendingApproval } from '@/modules/rooms';

/** P-02: what waits for the client, grouped by type (phases, files, documents, brand hub, final delivery), with how long each has waited. */
export function ApprovalsList({
  approvals,
  decides,
  decide,
}: {
  approvals: ClientPendingApproval[];
  decides: boolean;
  decide: DecideApproval;
}) {
  const t = useTranslations('proofing.approvals');
  const format = useFormatter();
  const groups = [
    { key: 'phases' as const, items: approvals.filter((approval) => approval.kind === 'phase') },
    { key: 'files' as const, items: approvals.filter((approval) => approval.kind === 'file') },
    {
      key: 'documents' as const,
      items: approvals.filter((approval) => approval.kind === 'document'),
    },
    {
      key: 'brandHub' as const,
      items: approvals.filter((approval) => approval.kind === 'brand_hub'),
    },
    {
      key: 'retainer' as const,
      items: approvals.filter((approval) => approval.kind === 'retainer'),
    },
    {
      key: 'delivery' as const,
      items: approvals.filter((approval) => approval.kind === 'delivery'),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section
          key={group.key}
          aria-labelledby={`approvals-${group.key}`}
          className="flex flex-col gap-3"
        >
          <h2 id={`approvals-${group.key}`} className="text-heading text-text">
            {t(group.key)}
          </h2>
          <ul className="flex flex-col gap-4">
            {group.items.map((approval) => (
              <li
                key={approval.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex flex-col gap-1">
                  <h3 className="text-title-sm text-text">{approval.subjectName}</h3>
                  <p className="text-body-sm text-text-secondary">{approval.projectName}</p>
                  <p className="text-caption text-text-secondary">
                    {t('waiting', {
                      date: format.dateTime(new Date(approval.requestedAt), {
                        day: 'numeric',
                        month: 'short',
                      }),
                    })}
                  </p>
                </div>
                {approval.kind === 'file' && approval.versionId ? (
                  <Link
                    href={`/portal/proofs/${approval.versionId}`}
                    aria-label={t('openFile', { name: approval.subjectName })}
                    className="self-start rounded-md bg-primary px-4 py-2 text-body-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    {t('openFile', { name: approval.subjectName })}
                  </Link>
                ) : approval.kind === 'document' && approval.documentId ? (
                  <Link
                    href={`/portal/docs/${approval.documentId}`}
                    aria-label={t('openDocument', { name: approval.subjectName })}
                    className="self-start rounded-md bg-primary px-4 py-2 text-body-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    {t('openDocument', { name: approval.subjectName })}
                  </Link>
                ) : approval.kind === 'retainer' ? (
                  <Link
                    href="/portal/progress"
                    className="self-start rounded-md bg-primary px-4 py-2 text-body-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    {t('openRetainer')}
                  </Link>
                ) : approval.kind === 'brand_hub' ? (
                  <Link
                    href="/portal/hub"
                    className="self-start rounded-md bg-primary px-4 py-2 text-body-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    {t('openHub')}
                  </Link>
                ) : decides ? (
                  <ApprovalDecision approvalId={approval.id} decide={decide} />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
