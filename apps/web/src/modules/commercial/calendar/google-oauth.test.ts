import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildAuthorizationUrl,
  createPkcePair,
  exchangeCode,
  GOOGLE_SCOPES,
  refreshAccessToken,
} from './google-oauth';

function idToken(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature`;
}

function respond(status: number, body: unknown) {
  const requests: Array<{ url: string; body: string }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: String(init?.body ?? '') });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { requests, fetchImpl };
}

describe('google oauth', () => {
  it('builds the authorization url with pkce and offline access', () => {
    const url = new URL(
      buildAuthorizationUrl({
        clientId: 'client-id',
        redirectUri: 'https://os.example.com/api/integrations/google/callback',
        state: 'state-value',
        codeChallenge: 'challenge',
      }),
    );

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'client-id',
      redirect_uri: 'https://os.example.com/api/integrations/google/callback',
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      state: 'state-value',
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
      scope: GOOGLE_SCOPES.join(' '),
    });
    expect(GOOGLE_SCOPES).toEqual([
      'openid',
      'email',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.freebusy',
    ]);
  });

  it('creates an S256 pkce pair', () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });

  it('exchanges the code and reads the email from the id token', async () => {
    const { requests, fetchImpl } = respond(200, {
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3599,
      id_token: idToken({ email: 'founder@gmail.com', email_verified: true }),
    });

    const result = await exchangeCode({
      code: 'code',
      codeVerifier: 'verifier',
      redirectUri: 'https://os.example.com/api/integrations/google/callback',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetch: fetchImpl,
    });

    expect(result).toEqual({ refreshToken: 'refresh', email: 'founder@gmail.com' });
    expect(requests[0]?.url).toBe('https://oauth2.googleapis.com/token');
    expect(Object.fromEntries(new URLSearchParams(requests[0]?.body))).toMatchObject({
      grant_type: 'authorization_code',
      code: 'code',
      code_verifier: 'verifier',
    });
  });

  it('refuses an exchange without a refresh token', async () => {
    const { fetchImpl } = respond(200, {
      access_token: 'access',
      id_token: idToken({ email: 'founder@gmail.com' }),
    });
    await expect(
      exchangeCode({
        code: 'code',
        codeVerifier: 'verifier',
        redirectUri: 'https://os.example.com/cb',
        clientId: 'id',
        clientSecret: 'secret',
        fetch: fetchImpl,
      }),
    ).rejects.toThrow(/refresh token/);
  });

  it('refreshes the access token and maps invalid_grant to revoked', async () => {
    const now = Date.now();
    const ok = await refreshAccessToken({
      refreshToken: 'refresh',
      clientId: 'id',
      clientSecret: 'secret',
      fetch: respond(200, { access_token: 'access', expires_in: 3600 }).fetchImpl,
    });
    expect(ok.accessToken).toBe('access');
    expect(ok.expiresAt.getTime()).toBeGreaterThanOrEqual(now + 3_599_000);

    await expect(
      refreshAccessToken({
        refreshToken: 'refresh',
        clientId: 'id',
        clientSecret: 'secret',
        fetch: respond(400, { error: 'invalid_grant' }).fetchImpl,
      }),
    ).rejects.toMatchObject({ reason: 'revoked' });
  });
});
