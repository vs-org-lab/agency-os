import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { AGENDA_TEST_NOW, testDatabase } from '@agency-os/db/testing';
import type { CalendarEventInput, CalendarPort } from '@/modules/commercial';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import type { AgendaDeps } from './access';

export function agendaClaims(
  userId: string,
  userKind: 'internal' | 'client' = 'internal',
): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: userKind === 'internal' ? 'aal2' : 'aal1',
    session_id: randomUUID(),
    amr: [
      {
        method: userKind === 'internal' ? 'totp' : 'otp',
        timestamp: Math.floor(Date.now() / 1000),
      },
    ],
    user_kind: userKind,
  };
}

export type RecordingCalendar = CalendarPort & {
  created: CalendarEventInput[];
  updated: { eventId: string; input: CalendarEventInput }[];
  deleted: string[];
  busy: { start: Date; end: Date }[];
  failing: boolean;
  missing: boolean;
};

/** A calendar that records every call and can be made to fail or to lose its events. */
export function recordingCalendar(): RecordingCalendar {
  const calendar: RecordingCalendar = {
    created: [],
    updated: [],
    deleted: [],
    busy: [],
    failing: false,
    missing: false,
    freeBusy: async () => {
      if (calendar.failing) throw new Error('Calendar unavailable');
      return calendar.busy;
    },
    createEvent: async (input) => {
      if (calendar.failing) throw new Error('Calendar unavailable');
      calendar.created.push(input);
      return {
        eventId: `event-${calendar.created.length}`,
        meetUrl: 'https://meet.google.com/abc',
      };
    },
    updateEvent: async (eventId, input) => {
      if (calendar.failing) throw new Error('Calendar unavailable');
      calendar.updated.push({ eventId, input });
      return calendar.missing ? 'missing' : 'updated';
    },
    deleteEvent: async (eventId) => {
      if (calendar.failing) throw new Error('Calendar unavailable');
      calendar.deleted.push(eventId);
    },
  };
  return calendar;
}

export function agendaDeps(sql: TransactionSql, options: { connected?: boolean } = {}) {
  const calendar = recordingCalendar();
  const flushes: number[] = [];
  const deps: AgendaDeps = {
    contexts: createDbContexts(testDatabase(sql)),
    calendar: async () =>
      options.connected === false ? null : { port: calendar, hostUserId: 'host' },
    flush: async () => {
      flushes.push(1);
    },
    now: () => AGENDA_TEST_NOW,
  };
  return { deps, calendar, flushes };
}
