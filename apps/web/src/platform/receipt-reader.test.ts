import { describe, expect, it } from 'vitest';
import {
  createGroqReceiptReader,
  EMPTY_PROPOSAL,
  FAKE_PROPOSAL,
  MAX_READABLE_IMAGE_BYTES,
  parseProposal,
  receiptReaderFrom,
} from './receipt-reader';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function groqAnswer(content: unknown, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [
        { message: { content: typeof content === 'string' ? content : JSON.stringify(content) } },
      ],
    }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

describe('receipt reader', () => {
  it('the groq request carries the model, the image and json mode', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const reader = createGroqReceiptReader('groq-key', (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return groqAnswer({
        date: '2026-10-02',
        vendor: 'Gráfica Lda',
        total: '120.50',
        currency: 'EUR',
        description: 'Impressão de cartões',
      });
    }) as typeof fetch);

    expect(await reader.read(PNG, 'image/png')).toEqual({
      spentOn: '2026-10-02',
      vendor: 'Gráfica Lda',
      amount: '120.50',
      currency: 'EUR',
      description: 'Impressão de cartões',
    });
    const [call] = calls;
    expect(call?.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(new Headers(call?.init?.headers).get('authorization')).toBe('Bearer groq-key');
    const body = JSON.parse(String(call?.init?.body)) as {
      model: string;
      temperature: number;
      response_format: { type: string };
      messages: { content: { type: string; image_url?: { url: string } }[] }[];
    };
    expect(body.model).toBe('qwen/qwen3.8-27b');
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({ type: 'json_object' });
    const image = body.messages
      .flatMap((message) => message.content)
      .find((part) => part.type === 'image_url');
    expect(image?.image_url?.url).toBe(
      `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`,
    );
  });

  it('odd answers become empty fields', () => {
    expect(
      parseProposal({
        date: '2026-02-30',
        vendor: '',
        total: '-12',
        currency: 'XYZ',
        description: 42,
      }),
    ).toEqual(EMPTY_PROPOSAL);
    expect(parseProposal({ total: 'doze euros', date: 'ontem' })).toEqual(EMPTY_PROPOSAL);
    expect(parseProposal('not json')).toEqual(EMPTY_PROPOSAL);
    expect(parseProposal(null)).toEqual(EMPTY_PROPOSAL);
    expect(parseProposal({ total: 12.345 }).amount).toBeNull();
    expect(parseProposal({ vendor: 'x'.repeat(200) }).vendor).toHaveLength(120);
  });

  it('portuguese amounts are read', () => {
    expect(parseProposal({ total: '12,50' }).amount).toBe('12.50');
    expect(parseProposal({ total: '1.234,56' }).amount).toBe('1234.56');
    expect(parseProposal({ total: '1,234.56' }).amount).toBe('1234.56');
    expect(parseProposal({ total: 99 }).amount).toBe('99.00');
    expect(parseProposal({ currency: 'eur' }).currency).toBe('EUR');
  });

  it('http errors give an empty proposal', async () => {
    const failing = createGroqReceiptReader('groq-key', (async () =>
      groqAnswer({}, 500)) as unknown as typeof fetch);
    expect(await failing.read(PNG, 'image/png')).toEqual(EMPTY_PROPOSAL);
    const broken = createGroqReceiptReader('groq-key', (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch);
    expect(await broken.read(PNG, 'image/png')).toEqual(EMPTY_PROPOSAL);
    const garbled = createGroqReceiptReader('groq-key', (async () =>
      groqAnswer('{not json')) as unknown as typeof fetch);
    expect(await garbled.read(PNG, 'image/png')).toEqual(EMPTY_PROPOSAL);
  });

  it('a reader that does not answer gives an empty proposal', async () => {
    const hanging = createGroqReceiptReader(
      'groq-key',
      ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })) as unknown as typeof fetch,
      'qwen/qwen3.8-27b',
      20,
    );
    expect(await hanging.read(PNG, 'image/png')).toEqual(EMPTY_PROPOSAL);
  });

  it('images too large for the model are not sent', async () => {
    let calls = 0;
    const reader = createGroqReceiptReader('groq-key', (async () => {
      calls += 1;
      return groqAnswer({ total: '1' });
    }) as unknown as typeof fetch);
    expect(await reader.read(new Uint8Array(MAX_READABLE_IMAGE_BYTES + 1), 'image/jpeg')).toEqual(
      EMPTY_PROPOSAL,
    );
    expect(calls).toBe(0);
  });

  it('the reader follows the configuration', async () => {
    expect(receiptReaderFrom({})).toBeNull();
    expect(receiptReaderFrom({ RECEIPT_READER: 'groq' })).toBeNull();
    expect(await receiptReaderFrom({ RECEIPT_READER: 'fake' })?.read(PNG, 'image/png')).toEqual(
      FAKE_PROPOSAL,
    );
    expect(receiptReaderFrom({ RECEIPT_READER: 'groq', GROQ_API_KEY: 'key' })).not.toBeNull();
  });

  it('the model can be replaced without a release', async () => {
    const models: string[] = [];
    const reader = createGroqReceiptReader(
      'groq-key',
      (async (_url: string, init?: RequestInit) => {
        models.push((JSON.parse(String(init?.body)) as { model: string }).model);
        return groqAnswer({});
      }) as typeof fetch,
      'another/vision-model',
    );
    await reader.read(PNG, 'image/png');
    expect(models).toEqual(['another/vision-model']);
  });
});
