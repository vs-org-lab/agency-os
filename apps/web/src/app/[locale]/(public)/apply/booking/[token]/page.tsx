import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { CancelBooking } from '@/components/public/cancel-booking';
import { PublicBooking } from '@/components/public/public-booking';
import { PublicFrame } from '@/components/public/public-frame';
import { requireLocale } from '@/i18n/require-locale';
import { publicBookingView } from '@/modules/commercial/server';
import { bookSlotAction, cancelBookingAction, rescheduleSlotAction } from '../../booking-actions';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; token: string }> };

export default async function ManageBookingPage({ params }: PageProps) {
  const { locale, token } = await params;
  setRequestLocale(requireLocale(locale));
  const t = await getTranslations('publicApply.booking');
  const format = await getFormatter();
  const source = { kind: 'manage', token } as const;
  const view = await publicBookingView(source);
  const scheduledAt = view.status === 'available' ? view.scheduledAt : null;

  return (
    <PublicFrame embed={false}>
      <header className="flex flex-col gap-2">
        <h1 className="text-display text-text">{t('manage.title')}</h1>
        {scheduledAt ? (
          <p className="text-body text-text-secondary">
            {t('manage.current', {
              when: format.dateTime(new Date(scheduledAt), {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short',
                timeZone: view.status === 'available' ? view.bookingTimeZone : undefined,
              }),
            })}
          </p>
        ) : view.status === 'available' ? (
          <p className="text-body text-text-secondary">{t('manage.cancelled')}</p>
        ) : null}
      </header>

      {scheduledAt ? (
        <>
          <PublicBooking view={view} action={rescheduleSlotAction.bind(null, token)} />
          <CancelBooking action={cancelBookingAction.bind(null, token)} />
        </>
      ) : (
        <PublicBooking view={view} action={bookSlotAction.bind(null, source)} />
      )}
    </PublicFrame>
  );
}
