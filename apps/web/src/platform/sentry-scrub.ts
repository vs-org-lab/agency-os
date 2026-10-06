import type { ErrorEvent } from '@sentry/nextjs';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const ALLOWED_HEADERS = new Set(['user-agent', 'accept-language', 'content-type', 'referer']);

function redactEmails(value: string | undefined): string | undefined {
  return value?.replace(EMAIL_PATTERN, '[email]');
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const scrubbed: ErrorEvent = { ...event };

  if (scrubbed.message !== undefined) scrubbed.message = redactEmails(scrubbed.message);

  if (scrubbed.request) {
    const headers = Object.fromEntries(
      Object.entries(scrubbed.request.headers ?? {}).filter(([name]) =>
        ALLOWED_HEADERS.has(name.toLowerCase()),
      ),
    );
    const { cookies: _cookies, data: _data, query_string: _query, ...request } = scrubbed.request;
    scrubbed.request = { ...request, headers };
  }

  if (scrubbed.user) {
    scrubbed.user = scrubbed.user.id === undefined ? {} : { id: scrubbed.user.id };
  }

  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      ...scrubbed.exception,
      values: scrubbed.exception.values.map((value) => ({
        ...value,
        value: redactEmails(value.value),
      })),
    };
  }

  return scrubbed;
}
