import { NonRetriableError, RetryAfterError } from 'inngest';
import { describe, expect, it } from 'vitest';
import { TranscriptionError } from './port';
import { stepFailure } from './step-errors';

describe('stepFailure', () => {
  it('waits for the window the provider names on a rate limit', () => {
    const failure = stepFailure(new TranscriptionError('rate_limited', 'limited', 1800));

    expect(failure).toBeInstanceOf(RetryAfterError);
    expect((failure as RetryAfterError).retryAfter).toBe('1800');
  });

  it('waits ten minutes when the provider names no window', () => {
    const failure = stepFailure(new TranscriptionError('rate_limited', 'limited'));

    expect((failure as RetryAfterError).retryAfter).toBe('600');
  });

  it('stops retrying a file the provider refuses by size', () => {
    expect(stepFailure(new TranscriptionError('file_too_large', 'large'))).toBeInstanceOf(
      NonRetriableError,
    );
  });

  it('leaves other failures to the default retries', () => {
    const error = new Error('network');

    expect(stepFailure(error)).toBe(error);
  });
});
