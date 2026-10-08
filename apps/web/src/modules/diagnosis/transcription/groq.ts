import { z } from 'zod';
import { TranscriptionError, type TranscriptionErrorCode, type TranscriptionPort } from './port';

const GROQ_TRANSCRIPTIONS_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL = 'whisper-large-v3';

const responseSchema = z.object({
  segments: z.array(z.object({ start: z.number(), end: z.number(), text: z.string() })).optional(),
});

function errorCode(status: number): TranscriptionErrorCode {
  if (status === 413) return 'file_too_large';
  if (status === 429) return 'rate_limited';
  return 'provider_error';
}

function retryAfterSeconds(response: Response): number | undefined {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

export function createGroqTranscription(options: {
  apiKey: string;
  fetch?: typeof fetch;
}): TranscriptionPort {
  const send = options.fetch ?? fetch;
  return {
    async transcribe(request) {
      const form = new FormData();
      form.append(
        'file',
        new File([new Uint8Array(request.bytes)], request.fileName, { type: request.contentType }),
      );
      form.append('model', GROQ_MODEL);
      form.append('response_format', 'verbose_json');
      form.append('language', request.language);
      form.append('temperature', '0');

      const response = await send(GROQ_TRANSCRIPTIONS_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${options.apiKey}` },
        body: form,
      });
      if (!response.ok) {
        throw new TranscriptionError(
          errorCode(response.status),
          `Transcription request failed with status ${response.status}`,
          retryAfterSeconds(response),
        );
      }

      const parsed = responseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) {
        throw new TranscriptionError('provider_error', 'Transcription response was malformed');
      }
      return (parsed.data.segments ?? []).map(({ start, end, text }) => ({ start, end, text }));
    },
  };
}
