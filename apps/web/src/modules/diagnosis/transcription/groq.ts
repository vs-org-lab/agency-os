import { z } from 'zod';
import {
  TranscriptionError,
  type TranscriptionErrorCode,
  type TranscriptionLanguage,
  type TranscriptionPort,
} from './port';

const GROQ_TRANSCRIPTIONS_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL = 'whisper-large-v3';

// Whisper's own decoding thresholds: a segment that is probably silence and decoded with low
// confidence, or that repeats itself, is a hallucination rather than speech.
const NO_SPEECH_PROBABILITY = 0.6;
const LOW_CONFIDENCE_LOG_PROBABILITY = -1;
const REPETITIVE_COMPRESSION_RATIO = 2.4;

// Subtitle credits that Whisper learnt from captioned video and emits over silence.
const CAPTION_CREDITS = [
  /^legendas?\b(?! (do|da|de|dos|das)\b)/i,
  /amara\.org/i,
  /^obrigad[oa] por (assistir|ver)/i,
  /^(subtitles|captions) by\b/i,
  /^thanks? (you )?for watching/i,
];

const CALL_CONTEXT: Record<TranscriptionLanguage, string> = {
  pt: 'Call de diagnóstico entre a agência Aurion e um cliente, em português de Portugal, sobre marca, site, marketing e vendas.',
  en: 'Diagnosis call between the Aurion agency and a client about brand, website, marketing and sales.',
};

const segmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string(),
  no_speech_prob: z.number().optional(),
  avg_logprob: z.number().optional(),
  compression_ratio: z.number().optional(),
});

const responseSchema = z.object({ segments: z.array(segmentSchema).optional() });

function isSpeech(segment: z.infer<typeof segmentSchema>): boolean {
  const silent =
    (segment.no_speech_prob ?? 0) > NO_SPEECH_PROBABILITY &&
    (segment.avg_logprob ?? 0) < LOW_CONFIDENCE_LOG_PROBABILITY;
  const repetitive = (segment.compression_ratio ?? 0) > REPETITIVE_COMPRESSION_RATIO;
  const text = segment.text.trim();
  return !silent && !repetitive && !CAPTION_CREDITS.some((credit) => credit.test(text));
}

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
      form.append('prompt', CALL_CONTEXT[request.language]);

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
      return (parsed.data.segments ?? [])
        .filter(isSpeech)
        .map(({ start, end, text }) => ({ start, end, text }));
    },
  };
}
