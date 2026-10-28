import { useFormatter, useTranslations } from 'next-intl';
import { ClientAvatar } from '@agency-os/ui/components/client-avatar';
import { cn } from '@agency-os/ui/lib/utils';
import { Link } from '@/i18n/navigation';
import type { HomeClient } from '@/modules/studio';

const LEVEL_TONE = {
  healthy: 'bg-success-bg text-success',
  attention: 'bg-warning-bg text-warning',
  at_risk: 'bg-danger-bg text-danger',
} as const;

/** One segment per phase: done phases solid, the current one half-tone. */
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
            'h-[3px] flex-1 rounded-full',
            index < done ? 'bg-primary' : index === done ? 'bg-primary/45' : 'bg-border',
          )}
        />
      ))}
    </span>
  );
}

/**
 * Clients with an active project as cards: avatar, plan and health tags, the current phase,
 * phase segments and the latest room activity.
 */
export function ClientProgress({ clients }: { clients: HomeClient[] }) {
  const t = useTranslations('studio.home.clients');
  const tHealth = useTranslations('health');
  const format = useFormatter();

  if (clients.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface px-4 py-3 text-body-sm text-text-secondary">
        {t('empty')}
      </p>
    );
  }

  return (
    <ul className="grid gap-2.5 md:grid-cols-2">
      {clients.map((client, index) => {
        const progress = client.progress;
        return (
          <li
            key={client.id}
            className="rd-rise"
            style={{ animationDelay: `${120 + index * 30}ms` }}
          >
            <Link
              href={`/c/${client.id}`}
              className="rd-lift flex h-full items-center gap-3.5 rounded-lg border border-border bg-surface px-4 py-3.5"
            >
              <ClientAvatar id={client.id} name={client.name} size="md" />
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-body-sm font-medium text-text">
                      {client.name}
                    </span>
                    {client.retainer ? (
                      <span className="shrink-0 rounded-full border border-border-strong px-1.5 text-caption text-text-secondary">
                        {t('retainer')}
                      </span>
                    ) : null}
                    {client.healthLevel ? (
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-1.5 text-caption font-medium',
                          LEVEL_TONE[client.healthLevel],
                        )}
                      >
                        {tHealth(`levels.${client.healthLevel}`)}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-caption text-text">
                    {client.currentPhase ?? t('noProject')}
                  </span>
                </span>
                {progress ? (
                  <PhaseSegments name={client.name} done={progress.done} total={progress.total} />
                ) : null}
                <span className="flex items-baseline justify-between gap-3 text-caption text-text-tertiary">
                  <span className="tabular-nums">
                    {progress
                      ? t('progress', { done: progress.done, total: progress.total })
                      : null}
                  </span>
                  <span>
                    {client.lastActivityAt
                      ? t('lastActivity', { date: format.relativeTime(client.lastActivityAt) })
                      : t('noActivity')}
                  </span>
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
