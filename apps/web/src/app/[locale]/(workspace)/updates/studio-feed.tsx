import { useFormatter, useTranslations } from 'next-intl';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { Link } from '@/i18n/navigation';
import type { FeedEntry, FeedEventType } from '@/modules/studio';

const TYPE_KEYS = {
  'contracts.proposal.accepted': 'proposal_accepted',
  'contracts.contract.client_signed': 'contract_signed',
  'billing.payment.received': 'payment_received',
  'rooms.approval.decided': 'approval_decided',
  'proofing.comment.added': 'proof_comment',
} as const satisfies Record<FeedEventType, string>;

/** S-02: client activity, newest first, each entry linking to its deal or room. */
export function StudioFeed({ entries }: { entries: FeedEntry[] }) {
  const t = useTranslations('studio.feed');
  const format = useFormatter();

  if (entries.length === 0) {
    return <EmptyState title={t('empty.title')} description={t('empty.description')} />;
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link
            href={entry.href}
            className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-muted"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-body font-medium text-text">
                {t(`types.${TYPE_KEYS[entry.type]}`, {
                  decision: entry.decision ?? 'other',
                  file: entry.subjectName ?? '',
                })}
              </span>
              <span className="truncate text-caption text-text-secondary">{entry.clientName}</span>
            </span>
            <time
              dateTime={entry.occurredAt.toISOString()}
              className="shrink-0 text-caption text-text-secondary"
            >
              {format.dateTime(entry.occurredAt, { dateStyle: 'medium', timeStyle: 'short' })}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
