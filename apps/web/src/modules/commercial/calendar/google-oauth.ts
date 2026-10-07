import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { GOOGLE_TIMEOUT_MS } from './google';
import { CalendarUnavailableError } from './port';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
] as const;

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function buildAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

const tokenResponseSchema = z.object({
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  id_token: z.string().optional(),
  error: z.string().optional(),
});

async function postForm(
  fetchImpl: typeof fetch,
  url: string,
  body: Record<string, string>,
): Promise<{ status: number; payload: z.infer<typeof tokenResponseSchema> }> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    });
  } catch (error) {
    throw new CalendarUnavailableError(
      'provider_error',
      error instanceof Error ? error.message : 'Google token request failed',
    );
  }
  const parsed = tokenResponseSchema.safeParse(await response.json().catch(() => ({})));
  return { status: response.status, payload: parsed.success ? parsed.data : {} };
}

function emailFromIdToken(idToken: string | undefined): string {
  const encoded = idToken?.split('.')[1];
  if (!encoded) throw new Error('Google did not return an identity token');
  const claims = z
    .object({ email: z.email() })
    .safeParse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
  if (!claims.success) throw new Error('Google identity token has no email');
  return claims.data.email.toLowerCase();
}

export async function exchangeCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
}): Promise<{ refreshToken: string; email: string }> {
  const { status, payload } = await postForm(input.fetch ?? fetch, TOKEN_ENDPOINT, {
    grant_type: 'authorization_code',
    code: input.code,
    code_verifier: input.codeVerifier,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });
  if (status !== 200) throw new Error(`Google token exchange failed with ${status}`);
  if (!payload.refresh_token) throw new Error('Google did not return a refresh token');
  return { refreshToken: payload.refresh_token, email: emailFromIdToken(payload.id_token) };
}

export async function refreshAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
}): Promise<{ accessToken: string; expiresAt: Date }> {
  const { status, payload } = await postForm(input.fetch ?? fetch, TOKEN_ENDPOINT, {
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });
  if (payload.error === 'invalid_grant') throw new CalendarUnavailableError('revoked');
  if (status !== 200 || !payload.access_token) {
    throw new CalendarUnavailableError(
      'provider_error',
      `Google token refresh failed with ${status}`,
    );
  }
  return {
    accessToken: payload.access_token,
    expiresAt: new Date(Date.now() + (payload.expires_in ?? 3600) * 1000),
  };
}

export async function revokeToken(token: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    await fetchImpl(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    });
  } catch {
    return;
  }
}
