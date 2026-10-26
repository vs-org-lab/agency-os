import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@agency-os/ui/components/badge';
import { requireLocale } from '@/i18n/require-locale';
import { isFounderActor } from '@/modules/commercial';
import { commercialSession, loadSettingsData } from '@/modules/commercial/server';
import { loadContractTemplates } from '@/modules/contracts/server';
import { loadCoreTemplates } from '@/modules/diagnosis/server';
import { ORBIT_PROCESS } from '@/modules/rooms';
import { loadProcessTemplates } from '@/modules/rooms/server';
import { getVerifiedClaims } from '@/platform/session';
import { saveTemplateAction } from '../commercial-actions';
import { TemplateForm } from '../settings-forms';
import {
  publishContractTemplateAction,
  publishCoreTemplateAction,
  publishProcessTemplateAction,
} from './actions';
import { ProcessTemplateEditor } from './process-template-editor';
import { ContractTemplateEditor } from './contract-template-editor';
import { BriefingGuideEditor } from './briefing-guide-editor';
import { OrbitGridEditor } from './orbit-grid-editor';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

const LOCALES = ['pt-PT', 'en'] as const;

type PageProps = { params: Promise<{ locale: string }> };

export default async function TemplatesSettingsPage({ params }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const session = await commercialSession(await getVerifiedClaims());
  if (!session || !isFounderActor(session.actor)) notFound();

  const t = await getTranslations('settings.templates');
  const sessionWithOrganization = {
    claims: session.claims,
    organizationId: session.actor.organizationId,
  };
  const [{ templates }, core, contracts, processes] = await Promise.all([
    loadSettingsData(session),
    loadCoreTemplates(sessionWithOrganization),
    loadContractTemplates(sessionWithOrganization),
    loadProcessTemplates(sessionWithOrganization),
  ]);
  const tp = await getTranslations('settings.processTemplates');
  const tk = await getTranslations('settings.contractTemplates');
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

      <section aria-labelledby="contract-templates-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="contract-templates-title" className="text-title-sm text-text">
            {tk('title')}
          </h2>
          <p className="text-body-sm text-text-secondary">{tk('description')}</p>
          <p className="text-body-sm text-warning">{tk('legalReview')}</p>
        </div>
        {LOCALES.map((locale) => (
          <details key={locale} className="rounded-lg border border-border bg-surface p-4">
            <summary className="cursor-pointer text-label text-text">
              {tk(`languages.${locale}`)}
            </summary>
            <div className="pt-4">
              <ContractTemplateEditor
                locale={locale}
                version={contracts[locale].version}
                body={contracts[locale].body}
                publish={publishContractTemplateAction.bind(null, locale)}
              />
            </div>
          </details>
        ))}
      </section>

      <section aria-labelledby="process-templates-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="process-templates-title" className="text-title-sm text-text">
            {tp('title')}
          </h2>
          <p className="text-body-sm text-text-secondary">{tp('description')}</p>
        </div>
        {processes.map((process) => (
          <details key={process.key} className="rounded-lg border border-border bg-surface p-4">
            <summary className="cursor-pointer text-label text-text">
              {process.name}
              {process.isDefault ? (
                <Badge variant="secondary" className="ml-2">
                  {tp('isDefault')}
                </Badge>
              ) : null}
            </summary>
            <div className="pt-4">
              <ProcessTemplateEditor template={process} publish={publishProcessTemplateAction} />
            </div>
          </details>
        ))}
        <details className="rounded-lg border border-border bg-surface p-4">
          <summary className="cursor-pointer text-label text-text">{tp('newTemplate')}</summary>
          <div className="pt-4">
            <ProcessTemplateEditor
              template={{
                key: null,
                name: '',
                version: 0,
                isDefault: false,
                definition: ORBIT_PROCESS,
              }}
              publish={publishProcessTemplateAction}
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

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'settings.templates.title');
}
