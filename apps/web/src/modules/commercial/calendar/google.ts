import type { Interval } from '../booking/slots';
import { CalendarUnavailableError, type CalendarEventInput, type CalendarPort } from './port';

export const GOOGLE_TIMEOUT_MS = 8000;

const API_BASE = 'https://www.googleapis.com/calendar/v3';

export type GoogleCalendarConfig = {
  calendarId: string;
  accessToken: () => Promise<string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type FreeBusyResponse = {
  calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
};

type EventResponse = {
  id?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
};

function eventBody(input: CalendarEventInput) {
  return {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.start.toISOString() },
    end: { dateTime: input.end.toISOString() },
    attendees: [{ email: input.attendee.email, displayName: input.attendee.name }],
    reminders: { useDefault: true },
  };
}

export function createGoogleCalendarPort(config: GoogleCalendarConfig): CalendarPort {
  const fetchImpl = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? GOOGLE_TIMEOUT_MS;
  const calendarPath = `${API_BASE}/calendars/${encodeURIComponent(config.calendarId)}/events`;

  async function request(
    url: string,
    init: { method: string; body?: unknown },
    acceptedStatuses: number[] = [],
  ): Promise<Response> {
    const token = await config.accessToken();
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: init.method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new CalendarUnavailableError(
        'provider_error',
        error instanceof Error ? error.message : 'Calendar request failed',
      );
    }
    if (response.ok || acceptedStatuses.includes(response.status)) return response;
    if (response.status === 401 || response.status === 403) {
      throw new CalendarUnavailableError('revoked');
    }
    throw new CalendarUnavailableError(
      'provider_error',
      `Google Calendar responded ${response.status}`,
    );
  }

  return {
    async freeBusy(range) {
      const response = await request(`${API_BASE}/freeBusy`, {
        method: 'POST',
        body: {
          timeMin: range.start.toISOString(),
          timeMax: range.end.toISOString(),
          items: [{ id: config.calendarId }],
        },
      });
      const payload = (await response.json()) as FreeBusyResponse;
      const busy = payload.calendars?.[config.calendarId]?.busy ?? [];
      return busy.map((interval): Interval => ({
        start: new Date(interval.start),
        end: new Date(interval.end),
      }));
    },

    async createEvent(input) {
      const response = await request(`${calendarPath}?conferenceDataVersion=1&sendUpdates=all`, {
        method: 'POST',
        body: {
          ...eventBody(input),
          conferenceData: {
            createRequest: {
              requestId: input.requestId,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        },
      });
      const payload = (await response.json()) as EventResponse;
      if (!payload.id) throw new CalendarUnavailableError('provider_error', 'Event id missing');
      const video = payload.conferenceData?.entryPoints?.find(
        (entry) => entry.entryPointType === 'video',
      );
      return { eventId: payload.id, meetUrl: payload.hangoutLink ?? video?.uri ?? null };
    },

    async updateEvent(eventId, input) {
      await request(`${calendarPath}/${encodeURIComponent(eventId)}?sendUpdates=all`, {
        method: 'PATCH',
        body: eventBody(input),
      });
    },

    async deleteEvent(eventId) {
      await request(
        `${calendarPath}/${encodeURIComponent(eventId)}?sendUpdates=all`,
        { method: 'DELETE' },
        [404, 410],
      );
    },
  };
}
