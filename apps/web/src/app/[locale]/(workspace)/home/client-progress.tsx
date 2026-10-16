import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Link } from '@/i18n/navigation';
import type { HomeClient } from '@/modules/studio';

const LEVEL_VARIANT = {
  healthy: 'secondary',
  attention: 'outline',
  at_risk: 'destructive',
} as const;

/**
 * Clients with an active project, the share of its phases done, the latest room activity, the
 * retainer label and, for those who see it, the latest health level.
 */
export function ClientProgress({ clients }: { clients: HomeClient[] }) {
  const t = useTranslations('studio.home.clients');
  const tHealth = useTranslations('health');
  const format = useFormatter();

  if (clients.length === 0) {
    return <p className="text-body-sm text-text-secondary">{t('empty')}</p>;
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {clients.map((client) => {
        const progress = client.progress;
        const percent =
          progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
        return (
          <li key={client.id}>
            <Link
              href={`/c/${client.id}`}
              className="flex flex-col gap-2 px-4 py-3 hover:bg-surface-muted"
            >
              <span className="flex items-baseline justify-between gap-4">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-body font-medium text-text">{client.name}</span>
                  {client.retainer ? <Badge variant="outline">{t('retainer')}</Badge> : null}
                  {client.healthLevel ? (
                    <Badge variant={LEVEL_VARIANT[client.healthLevel]}>
                      {tHealth(`levels.${client.healthLevel}`)}
                    </Badge>
                  ) : null}
                </span>
                <span className="shrink-0 text-caption text-text-secondary">
                  {client.lastActivityAt
                    ? t('lastActivity', {
                        date: format.relativeTime(client.lastActivityAt),
                      })
                    : t('noActivity')}
                </span>
              </span>
              {progress ? (
                <span className="flex items-center gap-3">
                  <span
                    role="progressbar"
                    aria-label={client.name}
                    aria-valuemin={0}
                    aria-valuemax={progress.total}
                    aria-valuenow={progress.done}
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted"
                  >
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${percent}%` }}
                    />
                  </span>
                  <span className="shrink-0 text-caption text-text-secondary tabular-nums">
                    {t('progress', { done: progress.done, total: progress.total })}
                  </span>
                </span>
              ) : (
                <span className="text-caption text-text-secondary">{t('noProject')}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
