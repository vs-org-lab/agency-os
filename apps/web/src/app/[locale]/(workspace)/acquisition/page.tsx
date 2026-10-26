import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@agency-os/ui/components/badge';
import { PageHeader } from '@agency-os/ui/components/page-header';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { requireLocale } from '@/i18n/require-locale';
import { isFounderActor, type AcquisitionTarget } from '@/modules/commercial';
import { commercialSession, loadAcquisition } from '@/modules/commercial/server';
import { getVerifiedClaims } from '@/platform/session';
import { CopyTemplate, ConvertTarget, TargetDialog } from './acquisition-forms';
import { convertTargetAction, saveTargetAction } from './actions';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

function bySector(targets: AcquisitionTarget[]): Array<[string, AcquisitionTarget[]]> {
  const groups = new Map<string, AcquisitionTarget[]>();
  for (const target of targets)
    groups.set(target.sector, [...(groups.get(target.sector) ?? []), target]);
  return [...groups.entries()];
}

export default async function AcquisitionPage({ params }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const session = await commercialSession(await getVerifiedClaims());
  if (!session || !session.actor.roles.some((role) => role === 'founder' || role === 'finance')) {
    notFound();
  }

  const t = await getTranslations('commercial.acquisition');
  const { targets, templates } = await loadAcquisition(session);
  const writable = isFounderActor(session.actor);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader
          title={t('title')}
          description={t('description')}
          actions={
            writable ? (
              <TargetDialog
                action={saveTargetAction.bind(null, null)}
                defaults={null}
                idPrefix="new-target"
              />
            ) : null
          }
        />

        {targets.length === 0 ? (
          <EmptyState title={t('empty.title')} description={t('empty.description')} />
        ) : (
          bySector(targets).map(([sector, group]) => (
            <section key={sector} className="flex flex-col gap-3">
              <h2 className="text-title-sm text-text">{sector}</h2>
              <ul className="flex flex-col gap-3">
                {group.map((target) => (
                  <li
                    key={target.id}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-col">
                        <span className="text-body font-medium text-text">
                          {target.companyName}
                        </span>
                        {target.website ? (
                          <a
                            href={target.website}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-caption text-link hover:underline"
                          >
                            {target.website}
                          </a>
                        ) : null}
                      </div>
                      <Badge variant="secondary">{t(`statuses.${target.status}`)}</Badge>
                    </div>
                    {target.notes ? (
                      <p className="whitespace-pre-line text-body-sm text-text-secondary">
                        {target.notes}
                      </p>
                    ) : null}
                    {writable && !target.convertedClientId ? (
                      <div className="flex flex-wrap items-start gap-2">
                        <ConvertTarget
                          action={convertTargetAction.bind(null, target.id)}
                          companyName={target.companyName}
                        />
                        <TargetDialog
                          action={saveTargetAction.bind(null, target.id)}
                          defaults={target}
                          idPrefix={`target-${target.id}`}
                        />
                      </div>
                    ) : null}
                    {target.convertedClientId ? (
                      <p className="text-caption text-text-tertiary">{t('converted')}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <aside className="flex flex-col gap-3">
        <h2 className="text-title-sm text-text">{t('templates.title')}</h2>
        {templates.length === 0 ? (
          <p className="text-body-sm text-text-secondary">{t('templates.empty')}</p>
        ) : (
          templates.map((template) => (
            <article
              key={template.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-label text-text">{template.name}</span>
                <span className="text-caption text-text-tertiary">
                  {template.sector ?? t('templates.allSectors')}
                </span>
              </div>
              <p className="whitespace-pre-line text-body-sm text-text-secondary">
                {template.body}
              </p>
              <div>
                <CopyTemplate body={template.body} />
              </div>
            </article>
          ))
        )}
      </aside>
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'commercial.acquisition.title');
}
