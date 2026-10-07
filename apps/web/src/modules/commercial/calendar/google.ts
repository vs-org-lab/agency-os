import type { Interval } from '../booking/slots';
import { CalendarUnavailableError, type CalendarEventInput, type CalendarPort } from './port';

export const GOOGLE_TIMEOUT_MS = 8000;

const API_BASE = 'https://www.googleapis.com/calendar/v3';
const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded']);

export type GoogleCalendarConfig = {
  calendarId: string;
  accessToken: () => Promise<string>;
  invalidateAccessToken?: () => void;
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

type ErrorResponse = {
  error?: { errors?: Array<{ domain?: string; reason?: string }> };
};

function eventBody(input: CalendarEventInput) {
  return {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.start.toISOString() },
    end: { dateTime: input.end.toISOString() },
    ...(input.attendee
      ? { attendees: [{ email: input.attendee.email, displayName: input.attendee.name }] }
      : {}),
    reminders: { useDefault: true },
  };
}

async function isRateLimited(response: Response): Promise<boolean> {
  const payload = (await response.json().catch(() => ({}))) as ErrorResponse;
  return (payload.error?.errors ?? []).some(
    (entry) => entry.domain === 'usageLimits' || RATE_LIMIT_REASONS.has(entry.reason ?? ''),
  );
}

export function createGoogleCalendarPort(config: GoogleCalendarConfig): CalendarPort {
  const fetchImpl = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? GOOGLE_TIMEOUT_MS;
  const calendarPath = `${API_BASE}/calendars/${encodeURIComponent(config.calendarId)}/events`;

  async function send(url: string, init: { method: string; body?: unknown }): Promise<Response> {
    const token = await config.accessToken();
    try {
      return await fetchImpl(url, {
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
  }

  /**
   * A 401 usually means a cached access token expired early; the request is retried once with
   * a fresh token. Only a refused refresh (invalid_grant) or a permission 403 means the
   * founder revoked access, so rate limits and repeated 401s stay transient provider errors.
   */
  async function request(
    url: string,
    init: { method: string; body?: unknown },
    acceptedStatuses: number[] = [],
  ): Promise<Response> {
    let response = await send(url, init);
    if (response.status === 401) {
      config.invalidateAccessToken?.();
      response = await send(url, init);
    }
    if (response.ok || acceptedStatuses.includes(response.status)) return response;
    if (response.status === 403 && !(await isRateLimited(response))) {
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
      const response = await request(
        `${calendarPath}/${encodeURIComponent(eventId)}?sendUpdates=all`,
        { method: 'PATCH', body: eventBody(input) },
        [404, 410],
      );
      return response.ok ? 'updated' : 'missing';
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
