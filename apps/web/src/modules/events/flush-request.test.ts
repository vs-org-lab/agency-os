import { describe, expect, it, vi } from 'vitest';
import { boundedFlushRequest } from './flush-request';

describe('bounded flush request', () => {
  it('returns once the timeout passes when the send never settles', async () => {
    vi.useFakeTimers();
    const onFailure = vi.fn();
    const request = boundedFlushRequest(() => new Promise<void>(() => {}), 2_000, onFailure);

    await vi.advanceTimersByTimeAsync(2_000);

    await expect(request).resolves.toBeUndefined();
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'flush_request_timeout' }),
    );
    vi.useRealTimers();
  });

  it('reports a failed send without throwing', async () => {
    const onFailure = vi.fn();
    const failure = new Error('fetch failed');

    await boundedFlushRequest(() => Promise.reject(failure), 2_000, onFailure);

    expect(onFailure).toHaveBeenCalledWith(failure);
  });

  it('reports nothing when the send succeeds in time', async () => {
    const onFailure = vi.fn();

    await boundedFlushRequest(() => Promise.resolve(), 2_000, onFailure);

    expect(onFailure).not.toHaveBeenCalled();
  });
});
