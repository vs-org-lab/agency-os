import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireLocale } from '@/i18n/require-locale';
import { isFounderActor } from '@/modules/commercial';
import { commercialSession, loadActiveForm } from '@/modules/commercial/server';
import { getVerifiedClaims } from '@/platform/session';
import { publishFormAction } from '../commercial-actions';
import { ApplicationFormEditor } from './application-form-editor';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

export default async function ApplicationSettingsPage({ params }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const session = await commercialSession(await getVerifiedClaims());
  if (!session || !isFounderActor(session.actor)) notFound();

  const t = await getTranslations('settings.application');
  const form = await loadActiveForm(session);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex max-w-[720px] flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="text-body text-text-secondary">{t('description')}</p>
      </header>
      <ApplicationFormEditor
        definition={form.definition}
        version={form.version}
        publish={publishFormAction}
      />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'settings.application.title');
}
