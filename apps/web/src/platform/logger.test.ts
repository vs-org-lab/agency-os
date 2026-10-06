import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger';

afterEach(() => {
  vi.restoreAllMocks();
});

function captureLine(write: () => void, stream: 'log' | 'warn' | 'error'): Record<string, unknown> {
  const spy = vi.spyOn(console, stream).mockImplementation(() => undefined);
  write();
  const [line] = spy.mock.calls[0] ?? [];
  return JSON.parse(String(line)) as Record<string, unknown>;
}

describe('logger', () => {
  it('writes one JSON line with level, message and timestamp', () => {
    const entry = captureLine(() => logger.info('outbox.dispatched', { count: 3 }), 'log');

    expect(entry).toMatchObject({ level: 'info', message: 'outbox.dispatched', count: 3 });
    expect(new Date(String(entry.timestamp)).toString()).not.toBe('Invalid Date');
  });

  it('logger never serialises fields named password, token, secret or code', () => {
    const entry = captureLine(
      () =>
        logger.warn('auth.attempt', {
          password: 'hunter2hunter2',
          accessToken: 'abc',
          secret: 's',
          code: '123456',
          nested: { refresh_token: 'r', userId: 'u-1' },
          requestId: 'req-1',
        }),
      'warn',
    );

    const serialised = JSON.stringify(entry);
    for (const value of ['hunter2hunter2', '"abc"', '"s"', '123456', '"r"']) {
      expect(serialised).not.toContain(value);
    }
    expect(entry.requestId).toBe('req-1');
    expect(entry.nested).toEqual({ refresh_token: '[redacted]', userId: 'u-1' });
  });

  it('serialises errors with name and message only', () => {
    const entry = captureLine(
      () => logger.error('job.failed', { error: new TypeError('boom') }),
      'error',
    );

    expect(entry.error).toEqual({ name: 'TypeError', message: 'boom' });
  });
});
