import 'server-only';
import { withSystemContext } from '@/platform/db';
import { commercialEnv } from '@/platform/env';
import { hostCalendar } from '../calendar/integration';
import {
  bookCall,
  cancelCall,
  listSlots,
  rescheduleCall,
  resolveBookingAccess,
  type BookingDeps,
  type BookingSource,
  type BookResult,
  type CancelResult,
  type RescheduleResult,
} from './service';

export type PublicBookingView =
  | {
      status: 'available';
      slots: string[];
      bookingTimeZone: string;
      durationMinutes: number;
      scheduledAt: string | null;
    }
  | { status: 'unavailable' }
  | { status: 'closed' }
  | { status: 'invalid' };

function deps(): BookingDeps {
  return {
    contexts: { withSystemContext },
    linkSecret: commercialEnv().PUBLIC_LINK_SECRET,
    now: () => new Date(),
    calendar: hostCalendar,
  };
}

export async function publicBookingView(source: BookingSource): Promise<PublicBookingView> {
  const bookingDeps = deps();
  const access = await resolveBookingAccess(source, bookingDeps);
  if (!access) return { status: 'invalid' };
  const result = await listSlots(access, bookingDeps);
  if (result.status !== 'available') return result;
  return {
    status: 'available',
    slots: result.slots.map((slot) => slot.toISOString()),
    bookingTimeZone: result.rules.timeZone,
    durationMinutes: result.rules.durationMinutes,
    scheduledAt: result.scheduledAt?.toISOString() ?? null,
  };
}

export async function publicBook(
  source: BookingSource,
  input: { start: Date; leadTimeZone: string; ipAddress: string | null },
): Promise<BookResult | { status: 'invalid' }> {
  const bookingDeps = deps();
  const access = await resolveBookingAccess(source, bookingDeps);
  if (!access) return { status: 'invalid' };
  return bookCall(access, input, bookingDeps);
}

export function publicReschedule(
  manageToken: string,
  input: { start: Date; leadTimeZone: string },
): Promise<RescheduleResult> {
  return rescheduleCall(manageToken, input, deps());
}

export function publicCancel(manageToken: string): Promise<CancelResult> {
  return cancelCall(manageToken, deps());
}

export async function publicSlotList(source: BookingSource): Promise<string[]> {
  const view = await publicBookingView(source);
  return view.status === 'available' ? view.slots : [];
}
