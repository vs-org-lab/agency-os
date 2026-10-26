import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PublicBooking } from '@/components/public/public-booking';
import { PublicFrame } from '@/components/public/public-frame';
import { requireLocale } from '@/i18n/require-locale';
import { publicBookingView, resolveThanks } from '@/modules/commercial/server';
import { bookSlotAction } from '../booking-actions';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ embed?: string; ref?: string }>;
};

export default async function ApplyThanksPage({ params, searchParams }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const query = await searchParams;
  const embed = query.embed === '1';
  const t = await getTranslations('publicApply.thanks');
  const view = await resolveThanks(query.ref);

  if (view.path === 'a' && query.ref) {
    const source = { kind: 'thanks', token: query.ref } as const;
    const booking = await publicBookingView(source);
    if (booking.status === 'available') {
      return (
        <PublicFrame embed={embed}>
          <section className="flex flex-col gap-3">
            <h1 className="text-display text-text">{t('a.title')}</h1>
            <p className="text-body text-text-secondary">{t('a.body')}</p>
          </section>
          <PublicBooking view={booking} action={bookSlotAction.bind(null, source)} />
        </PublicFrame>
      );
    }
  }

  const messageKey = view.path === 'a' ? 'b' : view.path;
  return (
    <PublicFrame embed={embed}>
      <section className="flex flex-col gap-3">
        <h1 className="text-display text-text">{t(`${messageKey}.title`)}</h1>
        <p className="text-body text-text-secondary">{t(`${messageKey}.body`)}</p>
        {view.path === 'c' && view.selfDiagnosisUrl ? (
          <a
            href={view.selfDiagnosisUrl}
            className="text-body text-link underline-offset-4 hover:underline"
          >
            {t('c.selfDiagnosis')}
          </a>
        ) : null}
      </section>
    </PublicFrame>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'publicApply.title');
}
