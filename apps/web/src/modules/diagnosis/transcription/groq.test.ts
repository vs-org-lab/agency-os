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

  it('drops segments Whisper marks as probable silence', async () => {
    const transcription = createGroqTranscription({
      apiKey: 'test-key',
      fetch: fakeFetch(
        Response.json({
          segments: [
            { start: 0, end: 2, text: ' Obrigado.', no_speech_prob: 0.92, avg_logprob: -1.3 },
            {
              start: 2,
              end: 5,
              text: ' Vendemos online.',
              no_speech_prob: 0.92,
              avg_logprob: -0.2,
            },
            { start: 5, end: 8, text: ' Sim sim sim sim sim', compression_ratio: 3.1 },
          ],
        }),
      ),
    });

    expect(await transcription.transcribe(request)).toEqual([
      { start: 2, end: 5, text: ' Vendemos online.' },
    ]);
  });

  it('drops caption credits Whisper invents over silence', async () => {
    const transcription = createGroqTranscription({
      apiKey: 'test-key',
      fetch: fakeFetch(
        Response.json({
          segments: [
            { start: 0, end: 1, text: ' Legenda Adriana Zanotto' },
            { start: 1, end: 2, text: ' Legendas pela comunidade Amara.org' },
            { start: 2, end: 3, text: ' Obrigado por assistir!' },
            { start: 3, end: 4, text: ' A legenda do site está errada.' },
          ],
        }),
      ),
    });

    expect(await transcription.transcribe(request)).toEqual([
      { start: 3, end: 4, text: ' A legenda do site está errada.' },
    ]);
  });

  it('gives the model the call context in the call language', async () => {
    const captured: CapturedRequest[] = [];
    const transcription = createGroqTranscription({
      apiKey: 'test-key',
      fetch: async (input, init) => {
        captured.push({ url: String(input), init: init ?? {} });
        return Response.json({ segments: [] });
      },
    });

    await transcription.transcribe(request);
    await transcription.transcribe({ ...request, language: 'en' });

    const prompts = captured.map((call) => (call.init.body as FormData).get('prompt'));
    expect(prompts[0]).toMatch(/português de Portugal/);
    expect(prompts[1]).toMatch(/diagnosis call/i);
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
