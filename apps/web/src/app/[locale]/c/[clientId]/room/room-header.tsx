import type { ReactNode } from 'react';
import { Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { ClientAvatar } from '@agency-os/ui/components/client-avatar';
import { PageHeader } from '@agency-os/ui/components/page-header';
import { cn } from '@agency-os/ui/lib/utils';
import { Link } from '@/i18n/navigation';
import type { ProjectSummary } from '@/modules/rooms';

/**
 * The single heading of a room screen: the section title with the client as context, the preview
 * link, the page's primary action and the project selector when there is more than one (RF-052).
 */
export function RoomHeader({
  title,
  description,
  client,
  projects,
  selectedId,
  basePath,
  showPreviewLink,
  actions,
}: {
  title: string;
  description?: string;
  client: { id: string; name: string };
  projects: readonly ProjectSummary[];
  selectedId: string | null;
  basePath: string;
  showPreviewLink: boolean;
  /** Primary actions of the page, shown beside the preview link. */
  actions?: ReactNode;
}) {
  const t = useTranslations('rooms');
  const section = basePath.split('/')[3] ?? '';
  const previewQuery = new URLSearchParams({
    section,
    ...(selectedId ? { project: selectedId } : {}),
  });
  const previewHref = `/c/${client.id}/preview?${previewQuery.toString()}`;
  const hasActions = showPreviewLink || Boolean(actions);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title={title}
        description={description}
        leading={
          title === client.name ? (
            <ClientAvatar id={client.id} name={client.name} size="lg" />
          ) : undefined
        }
        context={
          title === client.name ? undefined : (
            <span className="text-caption text-text-secondary">{client.name}</span>
          )
        }
        actions={
          hasActions ? (
            <>
              {showPreviewLink ? (
                <Button asChild variant="outline">
                  <Link href={previewHref} prefetch={false}>
                    <Eye aria-hidden="true" />
                    {t('previewAsClient')}
                  </Link>
                </Button>
              ) : null}
              {actions}
            </>
          ) : null
        }
      />
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
    </div>
  );
}
