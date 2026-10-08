import { NonRetriableError, RetryAfterError } from 'inngest';
import { TranscriptionError } from './port';

const DEFAULT_RATE_LIMIT_WAIT_SECONDS = 600;

/**
 * Maps a failed transcription request to the retry behaviour of a background step: a rate limit
 * waits for the provider's window instead of spending the retries, and an oversized file stops.
 */
export function stepFailure(error: unknown): unknown {
  if (!(error instanceof TranscriptionError)) return error;
  if (error.code === 'rate_limited') {
    const seconds = error.retryAfterSeconds ?? DEFAULT_RATE_LIMIT_WAIT_SECONDS;
    return new RetryAfterError(error.message, seconds * 1000, { cause: error });
  }
  if (error.code === 'file_too_large') {
    return new NonRetriableError(error.message, { cause: error });
  }
  return error;
}
