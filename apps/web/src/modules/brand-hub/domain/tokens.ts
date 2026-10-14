import { createHmac, timingSafeEqual } from 'node:crypto';

export type HubTokenMode = 'password' | 'restricted';

export type HubTokenClaims = { hubId: string; mode: HubTokenMode; version: number };

type Payload = { h: string; m: HubTokenMode; v: number; e: number };

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(`brand-hub-site:${payload}`).digest('base64url');
}

/** A site token for one hub, mode and access version (SEC-42); only the OS can sign or read it. */
export function signHubToken(input: HubTokenClaims & { expiresAt: Date }, secret: string): string {
  const payload: Payload = {
    h: input.hubId,
    m: input.mode,
    v: input.version,
    e: input.expiresAt.getTime(),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded, secret)}`;
}

/** The token's hub, mode and access version, or null when it is malformed, forged or expired. */
export function verifyHubToken(token: string, secret: string, now: Date): HubTokenClaims | null {
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(encoded, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let payload: Partial<Payload>;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<Payload>;
  } catch {
    return null;
  }
  if (
    typeof payload.h !== 'string' ||
    (payload.m !== 'password' && payload.m !== 'restricted') ||
    typeof payload.v !== 'number' ||
    typeof payload.e !== 'number' ||
    payload.e <= now.getTime()
  ) {
    return null;
  }
  return { hubId: payload.h, mode: payload.m, version: payload.v };
}
