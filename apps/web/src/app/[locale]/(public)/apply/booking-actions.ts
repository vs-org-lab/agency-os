'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { BookingActionState } from '@/components/public/booking-panel';
import {
  publicBook,
  publicCancel,
  publicReschedule,
  publicSlotList,
  type BookingSource,
} from '@/modules/commercial/server';
import { logger } from '@/platform/logger';
import { clientIpAddress } from '@/platform/request';

function parseStart(formData: FormData): Date | null {
  const value = formData.get('start');
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timeZoneOf(formData: FormData): string {
  const value = formData.get('timeZone');
  return typeof value === 'string' ? value.slice(0, 64) : '';
}

export async function bookSlotAction(
  source: BookingSource,
  _state: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const start = parseStart(formData);
  if (!start) return { status: 'error' };

  try {
    const result = await publicBook(source, {
      start,
      leadTimeZone: timeZoneOf(formData),
      ipAddress: clientIpAddress(await headers()),
    });
    switch (result.status) {
      case 'booked':
        return {
          status: 'booked',
          startsAt: result.startsAt.toISOString(),
          meetUrl: result.meetUrl,
        };
      case 'slot_taken':
        return { status: 'slot_taken', slots: await publicSlotList(source) };
      case 'invalid':
        return { status: 'closed' };
      default:
        return { status: result.status };
    }
  } catch (error) {
    logger.error('commercial.booking_failed', { error });
    return { status: 'error' };
  }
}

export async function rescheduleSlotAction(
  manageToken: string,
  _state: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const start = parseStart(formData);
  if (!start) return { status: 'error' };

  try {
    const result = await publicReschedule(manageToken, {
      start,
      leadTimeZone: timeZoneOf(formData),
    });
    switch (result.status) {
      case 'rescheduled':
        return { status: 'booked', startsAt: result.startsAt.toISOString(), meetUrl: null };
      case 'slot_taken':
        return {
          status: 'slot_taken',
          slots: await publicSlotList({ kind: 'manage', token: manageToken }),
        };
      default:
        return { status: result.status };
    }
  } catch (error) {
    logger.error('commercial.reschedule_failed', { error });
    return { status: 'error' };
  }
}

export async function cancelBookingAction(manageToken: string): Promise<void> {
  try {
    await publicCancel(manageToken);
  } catch (error) {
    logger.error('commercial.cancel_failed', { error });
  }
  revalidatePath('/apply/booking/[token]', 'page');
}
