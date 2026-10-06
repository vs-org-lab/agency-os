import type { Breadcrumb, ErrorEvent, TransactionEvent } from '@sentry/core';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const ALLOWED_HEADERS = new Set(['user-agent', 'accept-language', 'content-type', 'referer']);
const URL_DATA_KEYS = ['url', 'from', 'to'] as const;

function redactEmails(value: string | undefined): string | undefined {
  return value?.replace(EMAIL_PATTERN, '[email]');
}

export function stripUrlSecrets(value: string): string {
  const end = value.search(/[?#]/);
  return end === -1 ? value : value.slice(0, end);
}

type RequestData = NonNullable<ErrorEvent['request']>;

function scrubRequest(request: RequestData): RequestData {
  const headers = Object.fromEntries(
    Object.entries(request.headers ?? {}).filter(([name]) =>
      ALLOWED_HEADERS.has(name.toLowerCase()),
    ),
  );
  const { cookies: _cookies, data: _data, query_string: _query, ...rest } = request;
  return {
    ...rest,
    ...(rest.url !== undefined ? { url: stripUrlSecrets(rest.url) } : {}),
    headers,
  };
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const scrubbed: ErrorEvent = { ...event };

  if (scrubbed.message !== undefined) scrubbed.message = redactEmails(scrubbed.message);
  if (scrubbed.request) scrubbed.request = scrubRequest(scrubbed.request);
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

export function scrubTransaction(event: TransactionEvent): TransactionEvent {
  const scrubbed: TransactionEvent = { ...event };
  if (scrubbed.transaction !== undefined) {
    scrubbed.transaction = stripUrlSecrets(scrubbed.transaction);
  }
  if (scrubbed.request) scrubbed.request = scrubRequest(scrubbed.request);
  if (scrubbed.user) {
    scrubbed.user = scrubbed.user.id === undefined ? {} : { id: scrubbed.user.id };
  }
  return scrubbed;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (!breadcrumb.data) return breadcrumb;
  const data = { ...breadcrumb.data };
  for (const key of URL_DATA_KEYS) {
    const value = data[key];
    if (typeof value === 'string') data[key] = stripUrlSecrets(value);
  }
  return { ...breadcrumb, message: redactEmails(breadcrumb.message), data };
}
