import { createHash } from 'node:crypto';

export const HIBP_TIMEOUT_MS = 3000;
const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';

export class BreachCheckUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Breached password check unavailable', { cause });
    this.name = 'BreachCheckUnavailableError';
  }
}

export async function isPwnedPassword(
  password: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<boolean> {
  const hash = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS);

  let body: string;
  try {
    const response = await fetchImpl(`${HIBP_RANGE_URL}${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Unexpected status ${response.status}`);
    body = await response.text();
  } catch (error) {
    throw new BreachCheckUnavailableError(error);
  } finally {
    clearTimeout(timeout);
  }

  return body.split(/\r?\n/).some((line) => {
    const [candidate, count] = line.trim().split(':');
    return candidate?.toUpperCase() === suffix && Number(count) > 0;
  });
}
