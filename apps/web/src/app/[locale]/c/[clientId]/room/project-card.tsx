import { useFormatter, useTranslations } from 'next-intl';
import type { ClientHealthView } from '@/modules/health';
import type { Person, ProjectView } from '@/modules/rooms';

/** The project card on C-01: status, current phase, dates and the staff assigned to the client. */
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

  return (
    <section
      aria-labelledby="project-card-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <h2 id="project-card-title" className="text-title-sm text-text">
        {t('card.title')}
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
        <dt className="text-text-secondary">{t('card.status')}</dt>
        <dd className="text-text">{t(`projectStatus.${project.status}`)}</dd>
        <dt className="text-text-secondary">{t('card.currentPhase')}</dt>
        <dd className="text-text">{current?.name ?? t('card.noCurrentPhase')}</dd>
        <dt className="text-text-secondary">{t('card.startsOn')}</dt>
        <dd className="text-text">{day(project.startsOn)}</dd>
        <dt className="text-text-secondary">{t('card.endsOn')}</dt>
        <dd className="text-text">{project.endsOn ? day(project.endsOn) : t('card.noEnd')}</dd>
        <dt className="text-text-secondary">{t('card.people')}</dt>
        <dd className="text-text">
          {team.length > 0 ? team.map((person) => person.name).join(', ') : t('card.nobody')}
        </dd>
      </dl>
      {health && health.score !== null && health.level !== null ? (
        <p className="text-caption text-text-secondary">
          {t('card.healthLine', { score: health.score, level: th(`levels.${health.level}`) })}
        </p>
      ) : null}
    </section>
  );
}
