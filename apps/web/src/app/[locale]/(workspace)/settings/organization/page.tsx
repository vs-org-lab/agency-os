import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { requireLocale } from '@/i18n/require-locale';
import { isFounderActor } from '@/modules/commercial';
import { commercialSession } from '@/modules/commercial/server';
import { loadLegalEntities } from '@/modules/contracts/server';
import { getVerifiedClaims } from '@/platform/session';
import { archiveEntityAction, saveEntityAction } from './actions';
import { EntityForm } from './entity-form';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

export default async function OrganizationSettingsPage({ params }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const session = await commercialSession(await getVerifiedClaims());
  if (!session || !isFounderActor(session.actor)) notFound();

  const t = await getTranslations('settings.organization');
  const entities = await loadLegalEntities(session);

  return (
    <div className="flex max-w-180 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="text-body text-text-secondary">{t('description')}</p>
      </header>

      <section aria-labelledby="entities-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="entities-title" className="text-title-sm text-text">
            {t('entities')}
          </h2>
          <p className="text-body-sm text-text-secondary">{t('entitiesHint')}</p>
        </div>

        {entities.length === 0 ? (
          <p className="text-body-sm text-text-secondary">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {entities.map((entity) => (
              <li
                key={entity.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body font-medium text-text">{entity.legalName}</span>
                  <Badge variant="secondary">{t(`countries.${entity.country}`)}</Badge>
                  {entity.isDefault ? <Badge>{t('default')}</Badge> : null}
                </div>
                <p className="text-body-sm text-text-secondary">
                  {t('summary', {
                    taxId: entity.taxId,
                    address: entity.address,
                    representative: entity.representativeName,
                    role: entity.representativeRole,
                  })}
                </p>
                <div className="flex flex-wrap items-start gap-3">
                  <details className="flex-1">
                    <summary className="cursor-pointer text-body-sm text-link">{t('edit')}</summary>
                    <div className="pt-3">
                      <EntityForm
                        entity={entity}
                        idPrefix={`entity-${entity.id}`}
                        save={saveEntityAction}
                      />
                    </div>
                  </details>
                  <form action={archiveEntityAction.bind(null, entity.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      {t('archive')}
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        <details className="rounded-lg border border-border bg-surface p-4">
          <summary className="cursor-pointer text-label text-text">{t('add')}</summary>
          <div className="pt-4">
            <EntityForm entity={null} idPrefix="new-entity" save={saveEntityAction} />
          </div>
        </details>
      </section>
    </div>
  );
}
