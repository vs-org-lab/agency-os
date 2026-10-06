import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { HIBP_TIMEOUT_MS, isPwnedPassword } from './hibp';

const PASSWORD = 'correct horse battery staple';
const HASH = createHash('sha1').update(PASSWORD).digest('hex').toUpperCase();
const PREFIX = HASH.slice(0, 5);
const SUFFIX = HASH.slice(5);

function rangeResponse(lines: string[]): Response {
  return new Response(lines.join('\r\n'), { status: 200 });
}

describe('isPwnedPassword', () => {
  it('sends only the five character prefix', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(rangeResponse([]));

    await isPwnedPassword(PASSWORD, fetchImpl);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    expect(url).not.toContain(SUFFIX);
    expect(JSON.stringify(init)).not.toContain(SUFFIX);
    expect(new Headers(init.headers).get('Add-Padding')).toBe('true');
  });

  it('detects pwned suffix and ignores padded zero-count entries', async () => {
    expect(
      await isPwnedPassword(PASSWORD, vi.fn().mockResolvedValue(rangeResponse([`${SUFFIX}:42`]))),
    ).toBe(true);
    expect(
      await isPwnedPassword(PASSWORD, vi.fn().mockResolvedValue(rangeResponse([`${SUFFIX}:0`]))),
    ).toBe(false);
    expect(
      await isPwnedPassword(
        PASSWORD,
        vi.fn().mockResolvedValue(rangeResponse(['0000000000000000000000000000000000A:3'])),
      ),
    ).toBe(false);
  });

  it('matches suffixes case-insensitively', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(rangeResponse([`${SUFFIX.toLowerCase()}:5`]));

    expect(await isPwnedPassword(PASSWORD, fetchImpl)).toBe(true);
  });

  it('rejects with retryable error when hibp times out', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const pending = isPwnedPassword(PASSWORD, fetchImpl);
    const assertion = expect(pending).rejects.toThrow(/unavailable/);
    await vi.advanceTimersByTimeAsync(HIBP_TIMEOUT_MS + 1);
    await assertion;
    vi.useRealTimers();
  });

  it('rejects when the service answers with an error status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 503 }));

    await expect(isPwnedPassword(PASSWORD, fetchImpl)).rejects.toThrow(/unavailable/);
  });
});
