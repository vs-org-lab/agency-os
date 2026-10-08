import type { TranscriptSegment } from './merge';

export type TranscriptionLanguage = 'pt' | 'en';

export type TranscriptionRequest = {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
  language: TranscriptionLanguage;
};

export type TranscriptionPort = {
  transcribe(request: TranscriptionRequest): Promise<TranscriptSegment[]>;
};

export type TranscriptionErrorCode = 'file_too_large' | 'rate_limited' | 'provider_error';

export class TranscriptionError extends Error {
  constructor(
    readonly code: TranscriptionErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }
}
