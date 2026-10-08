import { describe, expect, it } from 'vitest';
import { createGroqTranscription } from './groq';
import { TranscriptionError } from './port';

type CapturedRequest = { url: string; init: RequestInit };

function fakeFetch(response: Response, captured: CapturedRequest[] = []): typeof fetch {
  return async (input, init) => {
    captured.push({ url: String(input), init: init ?? {} });
    return response;
  };
}

const request = {
  bytes: new Uint8Array([1, 2, 3]),
  fileName: 'client.webm',
  contentType: 'audio/webm',
  language: 'pt' as const,
};

describe('groq transcription', () => {
  it('sends the audio with the model, format and language', async () => {
    const captured: CapturedRequest[] = [];
    const transcription = createGroqTranscription({
      apiKey: 'test-key',
      fetch: fakeFetch(
        Response.json({
          text: 'Olá. Tudo bem?',
          segments: [
            { id: 0, start: 0, end: 1.5, text: ' Olá.' },
            { id: 1, start: 1.5, end: 3, text: ' Tudo bem?' },
          ],
        }),
        captured,
      ),
    });

    const segments = await transcription.transcribe(request);

    expect(segments).toEqual([
      { start: 0, end: 1.5, text: ' Olá.' },
      { start: 1.5, end: 3, text: ' Tudo bem?' },
    ]);
    const [call] = captured;
    expect(call?.url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(call?.init.method).toBe('POST');
    expect(new Headers(call?.init.headers).get('authorization')).toBe('Bearer test-key');
    const form = call?.init.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.get('language')).toBe('pt');
    const file = form.get('file') as File;
    expect(file.name).toBe('client.webm');
    expect(file.type).toBe('audio/webm');
    expect(file.size).toBe(3);
  });

  it('returns no segments for silent audio', async () => {
    const transcription = createGroqTranscription({
      apiKey: 'test-key',
      fetch: fakeFetch(Response.json({ text: '' })),
    });

    expect(await transcription.transcribe(request)).toEqual([]);
  });

  it.each([
    [413, 'file_too_large'],
    [429, 'rate_limited'],
    [503, 'provider_error'],
  ] as const)('maps status %i to %s', async (status, code) => {
    const transcription = createGroqTranscription({
      apiKey: 'test-key',
      fetch: fakeFetch(new Response('{"error":{"message":"x"}}', { status })),
    });

    const failure = await transcription.transcribe(request).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(TranscriptionError);
    expect((failure as TranscriptionError).code).toBe(code);
  });

  it('rejects a malformed response', async () => {
    const transcription = createGroqTranscription({
      apiKey: 'test-key',
      fetch: fakeFetch(Response.json({ segments: [{ start: 'x' }] })),
    });

    const failure = await transcription.transcribe(request).catch((error: unknown) => error);

    expect((failure as TranscriptionError).code).toBe('provider_error');
  });

  it('keeps the wait the provider asks for on a rate limit', async () => {
    const transcription = createGroqTranscription({
      apiKey: 'test-key',
      fetch: fakeFetch(new Response('{}', { status: 429, headers: { 'retry-after': '1800' } })),
    });

    const failure = await transcription.transcribe(request).catch((error: unknown) => error);

    expect((failure as TranscriptionError).retryAfterSeconds).toBe(1800);
  });
});
