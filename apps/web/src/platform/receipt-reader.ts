const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
/** Groq's vision models change; RECEIPT_READER_MODEL replaces this one without a release. */
const GROQ_VISION_MODEL = 'qwen/qwen3.8-27b';
/** How long the person waits for a proposal before filling the fields by hand. */
const READ_TIMEOUT_MS = 20_000;
/** Groq refuses base64 images above 4 MB; larger photos are left for the person to fill in. */
export const MAX_READABLE_IMAGE_BYTES = 3_000_000;

const CURRENCIES = ['EUR', 'GBP', 'USD', 'AOA'] as const;
type ReceiptCurrency = (typeof CURRENCIES)[number];

const CURRENCY_SYMBOLS: Record<string, ReceiptCurrency> = {
  '€': 'EUR',
  '£': 'GBP',
  $: 'USD',
  KZ: 'AOA',
};

const VENDOR_MAX = 120;
const DESCRIPTION_MAX = 500;

export type ReceiptImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/** What a receipt seems to say; every field is a suggestion the person confirms (RF-152). */
export type ReceiptProposal = {
  spentOn: string | null;
  vendor: string | null;
  amount: string | null;
  currency: ReceiptCurrency | null;
  description: string | null;
};

export type ReceiptReader = {
  read(image: Uint8Array, mimeType: ReceiptImageType): Promise<ReceiptProposal>;
};

export const EMPTY_PROPOSAL: ReceiptProposal = {
  spentOn: null,
  vendor: null,
  amount: null,
  currency: null,
  description: null,
};

export const FAKE_PROPOSAL: ReceiptProposal = {
  spentOn: '2026-10-02',
  vendor: 'Gráfica Exemplo',
  amount: '48.90',
  currency: 'EUR',
  description: 'Impressão de cartões de visita',
};

const INSTRUCTIONS =
  'Read this receipt or invoice. Answer only with a JSON object with the keys "date" (the purchase ' +
  'date as YYYY-MM-DD), "vendor" (who was paid), "total" (the total paid, as a number string), ' +
  '"currency" (ISO 4217 code) and "description" (what was bought, in the receipt language, one ' +
  'short sentence). Use null for anything you cannot read.';

function readDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value) ? value : null;
}

/** A positive amount with at most two decimals, read from `12,50`, `1.234,56` or `1,234.56`. */
function readAmount(value: unknown): string | null {
  let text: string;
  if (typeof value === 'number') text = String(value);
  else if (typeof value === 'string') text = value.replace(/[\s€£$]|kz/gi, '');
  else return null;
  if (!/^\d[\d.,]*$/.test(text)) return null;
  const lastSeparator = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
  const decimals = lastSeparator < 0 ? '' : text.slice(lastSeparator + 1);
  const isDecimal = lastSeparator >= 0 && decimals.length <= 2;
  const whole = (isDecimal ? text.slice(0, lastSeparator) : text).replace(/[.,]/g, '');
  if (typeof value === 'number' && !Number.isInteger(value * 100)) return null;
  const amount = Number(`${whole}.${isDecimal ? decimals : '0'}`);
  return Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : null;
}

function readCurrency(value: unknown): ReceiptCurrency | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return CURRENCIES.find((currency) => currency === code) ?? CURRENCY_SYMBOLS[code] ?? null;
}

function readText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, max);
  return text === '' ? null : text;
}

/** The model's answer as a proposal; anything that does not look right is left empty. */
export function parseProposal(raw: unknown): ReceiptProposal {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...EMPTY_PROPOSAL };
  const answer = raw as Record<string, unknown>;
  return {
    spentOn: readDate(answer.date),
    vendor: readText(answer.vendor, VENDOR_MAX),
    amount: readAmount(answer.total),
    currency: readCurrency(answer.currency),
    description: readText(answer.description, DESCRIPTION_MAX),
  };
}

/** Receipt reading with Groq's vision model; only the image is sent. */
export function createGroqReceiptReader(
  apiKey: string,
  fetcher: typeof fetch = fetch,
  model: string = GROQ_VISION_MODEL,
  timeoutMs: number = READ_TIMEOUT_MS,
): ReceiptReader {
  return {
    async read(image, mimeType) {
      if (image.length > MAX_READABLE_IMAGE_BYTES) return { ...EMPTY_PROPOSAL };
      const dataUrl = `data:${mimeType};base64,${Buffer.from(image).toString('base64')}`;
      try {
        const response = await fetcher(GROQ_CHAT_URL, {
          method: 'POST',
          signal: AbortSignal.timeout(timeoutMs),
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: INSTRUCTIONS },
                  { type: 'image_url', image_url: { url: dataUrl } },
                ],
              },
            ],
          }),
        });
        if (!response.ok) return { ...EMPTY_PROPOSAL };
        const body = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = body.choices?.[0]?.message?.content ?? '';
        return parseProposal(JSON.parse(content));
      } catch {
        return { ...EMPTY_PROPOSAL };
      }
    },
  };
}

export function receiptReaderFrom(
  source: Record<string, string | undefined>,
): ReceiptReader | null {
  if (source.RECEIPT_READER === 'fake') return { read: async () => ({ ...FAKE_PROPOSAL }) };
  if (source.RECEIPT_READER === 'groq' && source.GROQ_API_KEY) {
    return createGroqReceiptReader(
      source.GROQ_API_KEY,
      fetch,
      source.RECEIPT_READER_MODEL || GROQ_VISION_MODEL,
    );
  }
  return null;
}

export function receiptReader(): ReceiptReader | null {
  return receiptReaderFrom({
    RECEIPT_READER: process.env.RECEIPT_READER,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    RECEIPT_READER_MODEL: process.env.RECEIPT_READER_MODEL,
  });
}
