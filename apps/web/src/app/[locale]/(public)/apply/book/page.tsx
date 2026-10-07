import { setRequestLocale } from 'next-intl/server';
import { PublicBooking } from '@/components/public/public-booking';
import { PublicFrame } from '@/components/public/public-frame';
import { requireLocale } from '@/i18n/require-locale';
import { publicBookingView } from '@/modules/commercial/server';
import { bookSlotAction } from '../booking-actions';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function BookingLinkPage({ params, searchParams }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const source = { kind: 'link', token: (await searchParams).token ?? '' } as const;
  const view = await publicBookingView(source);

  return (
    <PublicFrame embed={false}>
      <PublicBooking view={view} action={bookSlotAction.bind(null, source)} />
    </PublicFrame>
  );
}
