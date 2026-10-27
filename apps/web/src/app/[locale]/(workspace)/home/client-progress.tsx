import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { ClientAvatar } from '@agency-os/ui/components/client-avatar';
import { cn } from '@agency-os/ui/lib/utils';
import { Link } from '@/i18n/navigation';
import type { HomeClient } from '@/modules/studio';

const LEVEL_VARIANT = {
  healthy: 'secondary',
  attention: 'outline',
  at_risk: 'destructive',
} as const;

/** One segment per phase, filled for the phases already done. */
function PhaseSegments({ name, done, total }: { name: string; done: number; total: number }) {
  return (
    <span
      role="progressbar"
      aria-label={name}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className="flex flex-1 gap-1"
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          role="presentation"
          data-done={index < done}
          className={cn(
            'h-1.5 flex-1 rounded-full',
            index < done ? 'bg-primary' : 'bg-surface-muted',
          )}
        />
      ))}
    </span>
  );
}

/**
 * Clients with an active project, one full-width row each: avatar, retainer label, phase
 * segments, the current phase and the latest room activity, plus the latest health level for
 * those who see it.
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
        return (
          <li key={client.id}>
            <Link
              href={`/c/${client.id}`}
              className="grid items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors duration-150 hover:bg-surface-muted md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]"
            >
              <span className="flex min-w-0 items-center gap-3">
                <ClientAvatar id={client.id} name={client.name} size="md" />
                <span className="flex min-w-0 flex-col items-start gap-1">
                  <span className="max-w-full truncate text-body font-medium text-text">
                    {client.name}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {client.retainer ? <Badge variant="outline">{t('retainer')}</Badge> : null}
                    {client.healthLevel ? (
                      <Badge variant={LEVEL_VARIANT[client.healthLevel]}>
                        {tHealth(`levels.${client.healthLevel}`)}
                      </Badge>
                    ) : null}
                  </span>
                </span>
              </span>
              {progress ? (
                <span className="flex min-w-0 flex-col gap-1.5">
                  <PhaseSegments name={client.name} done={progress.done} total={progress.total} />
                  <span className="flex items-baseline justify-between gap-3 text-caption text-text-secondary">
                    <span className="truncate text-text">{client.currentPhase}</span>
                    <span className="shrink-0 tabular-nums">
                      {t('progress', { done: progress.done, total: progress.total })}
                    </span>
                  </span>
                </span>
              ) : (
                <span className="text-caption text-text-secondary">{t('noProject')}</span>
              )}
              <span className="text-caption text-text-secondary md:text-right">
                {client.lastActivityAt
                  ? t('lastActivity', { date: format.relativeTime(client.lastActivityAt) })
                  : t('noActivity')}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
