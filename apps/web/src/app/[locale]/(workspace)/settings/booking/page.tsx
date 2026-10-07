import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireLocale } from '@/i18n/require-locale';
import { isFounderActor } from '@/modules/commercial';
import { commercialSession, loadSettingsData } from '@/modules/commercial/server';
import { getVerifiedClaims } from '@/platform/session';
import { saveBookingAction } from '../commercial-actions';
import { BookingSettingsForm } from '../settings-forms';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

export default async function BookingSettingsPage({ params }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const session = await commercialSession(await getVerifiedClaims());
  if (!session || !isFounderActor(session.actor)) notFound();

  const t = await getTranslations('settings.booking');
  const { settings } = await loadSettingsData(session);

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="text-body text-text-secondary">{t('description')}</p>
      </header>
      <BookingSettingsForm
        action={saveBookingAction}
        defaults={settings}
        timeZones={Intl.supportedValuesOf('timeZone')}
      />
    </div>
  );
}
