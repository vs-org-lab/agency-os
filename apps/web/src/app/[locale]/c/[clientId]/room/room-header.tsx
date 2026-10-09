import { useTranslations } from 'next-intl';
import { cn } from '@agency-os/ui/lib/utils';
import { Link } from '@/i18n/navigation';
import type { ProjectSummary } from '@/modules/rooms';

const LINK = 'text-body-sm text-link hover:underline';

/** Client name, the project selector when there is more than one project (RF-052) and the preview link. */
export function RoomHeader({
  clientId,
  clientName,
  projects,
  selectedId,
  basePath,
}: {
  clientId: string;
  clientName: string;
  projects: readonly ProjectSummary[];
  selectedId: string | null;
  basePath: string;
}) {
  const t = useTranslations('rooms');
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-title text-text">{clientName}</h1>
        {selectedId ? (
          <Link href={`/c/${clientId}/preview?project=${selectedId}`} className={LINK}>
            {t('previewAsClient')}
          </Link>
        ) : null}
      </div>
      {projects.length > 1 ? (
        <nav aria-label={t('projectSelector')}>
          <ul className="flex flex-wrap gap-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`${basePath}?project=${project.id}`}
                  aria-current={project.id === selectedId ? 'page' : undefined}
                  className={cn(
                    'inline-flex rounded-md border border-border px-3 py-1 text-body-sm text-text',
                    project.id === selectedId && 'border-text bg-surface-muted',
                  )}
                >
                  {project.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
