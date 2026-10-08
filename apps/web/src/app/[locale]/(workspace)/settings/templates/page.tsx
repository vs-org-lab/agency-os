import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@agency-os/ui/components/badge';
import { requireLocale } from '@/i18n/require-locale';
import { isFounderActor } from '@/modules/commercial';
import { commercialSession, loadSettingsData } from '@/modules/commercial/server';
import { loadCoreTemplates } from '@/modules/diagnosis/server';
import { getVerifiedClaims } from '@/platform/session';
import { saveTemplateAction } from '../commercial-actions';
import { TemplateForm } from '../settings-forms';
import { publishCoreTemplateAction } from './actions';
import { BriefingGuideEditor } from './briefing-guide-editor';
import { OrbitGridEditor } from './orbit-grid-editor';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

export default async function TemplatesSettingsPage({ params }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const session = await commercialSession(await getVerifiedClaims());
  if (!session || !isFounderActor(session.actor)) notFound();

  const t = await getTranslations('settings.templates');
  const [{ templates }, core] = await Promise.all([
    loadSettingsData(session),
    loadCoreTemplates({ claims: session.claims, organizationId: session.actor.organizationId }),
  ]);
  const tc = await getTranslations('settings.coreTemplates');

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="text-body text-text-secondary">{t('description')}</p>
      </header>

      <section aria-labelledby="core-templates-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="core-templates-title" className="text-title-sm text-text">
            {tc('title')}
          </h2>
          <p className="text-body-sm text-text-secondary">{tc('description')}</p>
        </div>
        <details className="rounded-lg border border-border bg-surface p-4">
          <summary className="cursor-pointer text-label text-text">{tc('guide.title')}</summary>
          <div className="pt-4">
            <BriefingGuideEditor
              guide={core.briefing.definition}
              version={core.briefing.version}
              publish={publishCoreTemplateAction.bind(null, 'briefing')}
            />
          </div>
        </details>
        <details className="rounded-lg border border-border bg-surface p-4">
          <summary className="cursor-pointer text-label text-text">{tc('grid.title')}</summary>
          <div className="pt-4">
            <OrbitGridEditor
              grid={core.grid.definition}
              version={core.grid.version}
              publish={publishCoreTemplateAction.bind(null, 'orbit_grid')}
            />
          </div>
        </details>
      </section>

      <details className="rounded-lg border border-border bg-surface p-4">
        <summary className="cursor-pointer text-label text-text">{t('new')}</summary>
        <div className="pt-4">
          <TemplateForm
            action={saveTemplateAction.bind(null, null)}
            defaults={null}
            idPrefix="new-template"
          />
        </div>
      </details>

      {templates.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {templates.map((template) => (
            <li
              key={template.templateId}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body font-medium text-text">{template.name}</span>
                <Badge variant="secondary">{t(`kinds.${template.kind}`)}</Badge>
                <Badge variant="secondary">{template.locale}</Badge>
              </div>
              <p className="whitespace-pre-line text-body-sm text-text-secondary">
                {template.body}
              </p>
              <details>
                <summary className="cursor-pointer text-body-sm text-link">{t('edit')}</summary>
                <div className="pt-3">
                  <TemplateForm
                    action={saveTemplateAction.bind(null, template.templateId)}
                    defaults={template}
                    idPrefix={`template-${template.templateId}`}
                  />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
