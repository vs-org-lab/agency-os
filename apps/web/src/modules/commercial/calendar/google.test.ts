import { describe, expect, it } from 'vitest';
import { createGoogleCalendarPort, GOOGLE_TIMEOUT_MS } from './google';
import { CalendarUnavailableError } from './port';

type Call = { url: string; method: string; body: unknown; authorization: string | null };

function fakeFetch(responses: Array<{ status: number; body?: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : null,
      authorization: headers.get('authorization'),
    });
    const next = responses.shift() ?? { status: 200, body: {} };
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
      status: next.status,
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const EVENT = {
  requestId: 'call-1',
  start: new Date('2026-10-13T09:00:00Z'),
  end: new Date('2026-10-13T09:45:00Z'),
  summary: 'Chamada de descoberta: Empresa Exemplo',
  description: 'Resumo da candidatura',
  attendee: { email: 'ana@empresa.pt', name: 'Ana Costa' },
};

describe('createGoogleCalendarPort', () => {
  it('requests free busy for the configured calendar', async () => {
    const { calls, fetchImpl } = fakeFetch([
      {
        status: 200,
        body: {
          calendars: {
            primary: { busy: [{ start: '2026-10-13T10:00:00Z', end: '2026-10-13T11:00:00Z' }] },
          },
        },
      },
    ]);
    const port = createGoogleCalendarPort({
      calendarId: 'primary',
      accessToken: async () => 'access-token',
      fetch: fetchImpl,
    });

    const busy = await port.freeBusy({
      start: new Date('2026-10-13T00:00:00Z'),
      end: new Date('2026-10-14T00:00:00Z'),
    });

    expect(busy).toEqual([
      { start: new Date('2026-10-13T10:00:00Z'), end: new Date('2026-10-13T11:00:00Z') },
    ]);
    expect(calls[0]).toMatchObject({
      url: 'https://www.googleapis.com/calendar/v3/freeBusy',
      method: 'POST',
      authorization: 'Bearer access-token',
      body: {
        timeMin: '2026-10-13T00:00:00.000Z',
        timeMax: '2026-10-14T00:00:00.000Z',
        items: [{ id: 'primary' }],
      },
    });
  });

  it('creates an event with a Meet request and the lead as attendee', async () => {
    const { calls, fetchImpl } = fakeFetch([
      { status: 200, body: { id: 'event-1', hangoutLink: 'https://meet.google.com/abc-defg-hij' } },
    ]);
    const port = createGoogleCalendarPort({
      calendarId: 'primary',
      accessToken: async () => 'access-token',
      fetch: fetchImpl,
    });

    const created = await port.createEvent(EVENT);

    expect(created).toEqual({
      eventId: 'event-1',
      meetUrl: 'https://meet.google.com/abc-defg-hij',
    });
    expect(calls[0]?.url).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
    );
    expect(calls[0]?.body).toMatchObject({
      summary: EVENT.summary,
      start: { dateTime: '2026-10-13T09:00:00.000Z' },
      end: { dateTime: '2026-10-13T09:45:00.000Z' },
      attendees: [{ email: 'ana@empresa.pt', displayName: 'Ana Costa' }],
      conferenceData: {
        createRequest: { requestId: 'call-1', conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
    });
  });

  it('maps 401 to revoked and 503 to provider_error', async () => {
    const revoked = createGoogleCalendarPort({
      calendarId: 'primary',
      accessToken: async () => 'token',
      fetch: fakeFetch([{ status: 401, body: {} }]).fetchImpl,
    });
    const failing = createGoogleCalendarPort({
      calendarId: 'primary',
      accessToken: async () => 'token',
      fetch: fakeFetch([{ status: 503, body: {} }]).fetchImpl,
    });

    await expect(revoked.createEvent(EVENT)).rejects.toMatchObject({ reason: 'revoked' });
    await expect(failing.createEvent(EVENT)).rejects.toBeInstanceOf(CalendarUnavailableError);
    await expect(
      createGoogleCalendarPort({
        calendarId: 'primary',
        accessToken: async () => 'token',
        fetch: fakeFetch([{ status: 503, body: {} }]).fetchImpl,
      }).createEvent(EVENT),
    ).rejects.toMatchObject({ reason: 'provider_error' });
  });

  it('treats a missing event as already deleted', async () => {
    const port = createGoogleCalendarPort({
      calendarId: 'primary',
      accessToken: async () => 'token',
      fetch: fakeFetch([{ status: 410 }]).fetchImpl,
    });
    await expect(port.deleteEvent('event-1')).resolves.toBeUndefined();
  });

  it('aborts after the timeout', async () => {
    expect(GOOGLE_TIMEOUT_MS).toBe(8000);
    const hanging = ((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      })) as typeof fetch;
    const port = createGoogleCalendarPort({
      calendarId: 'primary',
      accessToken: async () => 'token',
      fetch: hanging,
      timeoutMs: 20,
    });

    await expect(
      port.freeBusy({ start: new Date(), end: new Date(Date.now() + 3_600_000) }),
    ).rejects.toMatchObject({ reason: 'provider_error' });
  });
});
