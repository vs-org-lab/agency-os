import type { ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { ClientAvatar } from '@agency-os/ui/components/client-avatar';
import { cn } from '@agency-os/ui/lib/utils';
import type { ClientHealthView } from '@/modules/health';
import type { Person, ProjectView } from '@/modules/rooms';

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption font-medium text-text-tertiary">{label}</span>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-body-sm">{children}</dl>
    </div>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-text-secondary">{term}</dt>
      <dd className="text-right text-text">{children}</dd>
    </>
  );
}

/** The project panel on C-01: status, current phase, dates and the staff on the client. */
export function ProjectCard({
  project,
  team,
  health = null,
}: {
  project: ProjectView;
  team: readonly Person[];
  health?: ClientHealthView | null;
}) {
  const t = useTranslations('rooms');
  const th = useTranslations('health');
  const format = useFormatter();
  const current = project.phases.find(
    (phase) => phase.status === 'in_progress' || phase.status === 'awaiting_approval',
  );
  const day = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00Z`), { dateStyle: 'medium' });
  const active = project.status === 'active';

  return (
    <section
      aria-labelledby="project-card-title"
      className="rd-rise flex flex-col gap-4 self-start rounded-lg border border-border bg-surface p-4"
      style={{ animationDelay: '80ms' }}
    >
      <div className="flex flex-col gap-0.5">
        <h2 id="project-card-title" className="text-caption font-medium text-text-tertiary">
          {t('card.title')}
        </h2>
        <p className="text-body font-semibold text-text">{project.name}</p>
      </div>
      <Group label={t('card.progress')}>
        <Row term={t('card.status')}>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2 text-caption font-medium',
              active ? 'bg-success-bg text-success' : 'bg-neutral-bg text-text-secondary',
            )}
          >
            <span
              aria-hidden
              className={cn('size-1.5 rounded-full', active ? 'bg-success' : 'bg-text-tertiary')}
            />
            {t(`projectStatus.${project.status}`)}
          </span>
        </Row>
        <Row term={t('card.currentPhase')}>{current?.name ?? t('card.noCurrentPhase')}</Row>
      </Group>
      <Group label={t('card.dates')}>
        <Row term={t('card.startsOn')}>{day(project.startsOn)}</Row>
        <Row term={t('card.endsOn')}>{project.endsOn ? day(project.endsOn) : t('card.noEnd')}</Row>
      </Group>
      <Group label={t('card.people')}>
        <Row term={t('card.peopleCount', { count: team.length })}>
          {team.length > 0 ? (
            <span className="inline-flex items-center gap-2">
              <span className="flex -space-x-1.5" aria-hidden>
                {team.slice(0, 4).map((person) => (
                  <ClientAvatar
                    key={person.id}
                    id={person.id}
                    name={person.name}
                    size="sm"
                    tone="neutral"
                    className="ring-2 ring-surface"
                  />
                ))}
              </span>
              <span>{team.map((person) => person.name).join(', ')}</span>
            </span>
          ) : (
            t('card.nobody')
          )}
        </Row>
      </Group>
      <p className="border-t border-border pt-3 text-caption text-text-secondary">
        {health && health.score !== null && health.level !== null
          ? t('card.healthLine', { score: health.score, level: th(`levels.${health.level}`) })
          : t('card.healthEmpty')}
      </p>
    </section>
  );
}
