import type { ErrorEvent, TransactionEvent } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { scrubBreadcrumb, scrubEvent, scrubTransaction } from './sentry-scrub';

describe('scrubEvent', () => {
  it('scrub removes authorization and cookie headers, emails and request bodies', () => {
    const event = {
      type: undefined,
      message: 'Invite failed for ana.silva@cliente.pt',
      request: {
        url: 'https://os.example/settings',
        headers: {
          authorization: 'Bearer secret',
          cookie: 'sb-access-token=abc',
          'user-agent': 'Mozilla/5.0',
          'x-forwarded-for': '203.0.113.1',
        },
        cookies: { 'sb-access-token': 'abc' },
        data: { password: 'hunter2hunter2' },
        query_string: 'token_hash=abc&type=invite',
      },
      user: { id: 'user-1', email: 'ana.silva@cliente.pt', ip_address: '203.0.113.1' },
      exception: {
        values: [{ type: 'Error', value: 'Duplicate email joao@empresa.com' }],
      },
    } as ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request?.headers).toEqual({ 'user-agent': 'Mozilla/5.0' });
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.request?.query_string).toBeUndefined();
    expect(scrubbed.user).toEqual({ id: 'user-1' });
    expect(scrubbed.message).toBe('Invite failed for [email]');
    expect(scrubbed.exception?.values?.[0]?.value).toBe('Duplicate email [email]');
  });

  it('keeps events without request or user data intact', () => {
    const event = { type: undefined, message: 'Plain failure' } as ErrorEvent;

    expect(scrubEvent(event)).toEqual({ type: undefined, message: 'Plain failure' });
  });
});

describe('url scrubbing', () => {
  it('removes query strings and fragments from error request urls', () => {
    const event = {
      type: undefined,
      request: {
        url: 'https://os.example/callback?token_hash=secret&type=invite#access_token=abc',
      },
    } as ErrorEvent;

    expect(scrubEvent(event).request?.url).toBe('https://os.example/callback');
  });

  it('scrubs transaction urls and names', () => {
    const transaction = {
      type: 'transaction',
      transaction: '/accept-invitation?token_hash=secret',
      request: { url: 'https://os.example/accept-invitation?token_hash=secret#refresh_token=r' },
    } as TransactionEvent;

    const scrubbed = scrubTransaction(transaction);

    expect(scrubbed.transaction).toBe('/accept-invitation');
    expect(scrubbed.request?.url).toBe('https://os.example/accept-invitation');
  });

  it('scrubs navigation and fetch breadcrumbs', () => {
    const navigation = scrubBreadcrumb({
      category: 'navigation',
      data: { from: '/callback?code=abc', to: '/accept-invitation#access_token=x' },
    });
    const fetchCrumb = scrubBreadcrumb({
      category: 'fetch',
      data: { url: 'https://api.example/token?refresh_token=r', method: 'POST' },
    });

    expect(navigation?.data).toEqual({ from: '/callback', to: '/accept-invitation' });
    expect(fetchCrumb?.data).toEqual({ url: 'https://api.example/token', method: 'POST' });
  });
});
