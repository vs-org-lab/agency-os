'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Link } from '@/i18n/navigation';
import type { ClientProofSummary } from '@/modules/proofing';

function statusKey(status: ClientProofSummary['status']) {
  return status === 'pending' || status === 'approved' || status === 'changes_requested'
    ? status
    : 'none';
}

/** The client's proofs, decided or not, so each one stays reachable after its request. */
export function ClientProofList({ proofs }: { proofs: ClientProofSummary[] }) {
  const t = useTranslations('proofing.clientList');
  return (
    <ul className="flex flex-col gap-3">
      {proofs.map((proof) => (
        <li key={proof.versionId}>
          <Link
            href={`/portal/proofs/${proof.versionId}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-title-sm text-text">{proof.title}</span>
              <span className="text-caption text-text-secondary">
                {t('version', { number: proof.number })}
              </span>
            </span>
            <Badge variant="secondary">{t(`status.${statusKey(proof.status)}`)}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
