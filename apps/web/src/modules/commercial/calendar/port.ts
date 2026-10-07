import type { Interval } from '../booking/slots';

export type CalendarEventInput = {
  requestId: string;
  start: Date;
  end: Date;
  summary: string;
  description: string;
  attendee: { email: string; name: string };
};

export type CalendarPort = {
  freeBusy(range: Interval): Promise<Interval[]>;
  createEvent(input: CalendarEventInput): Promise<{ eventId: string; meetUrl: string | null }>;
  updateEvent(eventId: string, input: CalendarEventInput): Promise<void>;
  deleteEvent(eventId: string): Promise<void>;
};

export type CalendarUnavailableReason = 'not_connected' | 'revoked' | 'provider_error';

export class CalendarUnavailableError extends Error {
  readonly reason: CalendarUnavailableReason;

  constructor(reason: CalendarUnavailableReason, message?: string) {
    super(message ?? `Calendar unavailable: ${reason}`);
    this.name = 'CalendarUnavailableError';
    this.reason = reason;
  }
}
