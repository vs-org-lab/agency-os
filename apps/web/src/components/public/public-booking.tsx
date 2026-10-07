import { getTranslations } from 'next-intl/server';
import type { PublicBookingView } from '@/modules/commercial/server';
import { BookingPanel, type BookingActionState } from './booking-panel';

export async function PublicBooking({
  view,
  action,
}: {
  view: PublicBookingView;
  action: (state: BookingActionState, formData: FormData) => Promise<BookingActionState>;
}) {
  const t = await getTranslations('publicApply.booking');

  if (view.status === 'available') {
    return (
      <BookingPanel
        slots={view.slots}
        bookingTimeZone={view.bookingTimeZone}
        durationMinutes={view.durationMinutes}
        action={action}
      />
    );
  }
  return (
    <p className="text-body text-text-secondary">
      {view.status === 'unavailable' ? t('unavailable') : t('closed')}
    </p>
  );
}
