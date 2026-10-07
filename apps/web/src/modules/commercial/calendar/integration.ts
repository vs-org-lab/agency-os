import 'server-only';
import { resolveActor } from '@/modules/access';
import { requireRecentMfa } from '@/modules/identity';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import { calendarEnv, commercialEnv } from '@/platform/env';
import { signToken, verifyToken } from '@/platform/signed-token';
import {
  calendarConnectionStatus,
  disconnectGoogle,
  getHostCalendar,
  saveGoogleConnection,
  type ConnectionStatus,
} from './connections';
import { buildAuthorizationUrl, createPkcePair, exchangeCode, revokeToken } from './google-oauth';

const contexts = { withUserContext, withSystemContext };
const OAUTH_COOKIE_TTL_MS = 10 * 60 * 1000;

export const GOOGLE_CALLBACK_PATH = '/api/integrations/google/callback';

export type IntegrationsView = {
  provider: 'google' | 'fake';
  google: ConnectionStatus;
};

function redirectUri(): string {
  return new URL(GOOGLE_CALLBACK_PATH, commercialEnv().APP_BASE_URL).toString();
}

export async function integrationsView(claims: VerifiedClaims): Promise<IntegrationsView> {
  return {
    provider: calendarEnv().CALENDAR_PROVIDER,
    google: await calendarConnectionStatus(claims, { contexts }),
  };
}

export type StartConnectionResult =
  | { ok: true; authorizationUrl: string; cookieValue: string; cookieMaxAgeSeconds: number }
  | { ok: false; reason: 'reauthenticate' | 'not_configured' };

export function startGoogleConnection(claims: VerifiedClaims): StartConnectionResult {
  if (!requireRecentMfa(claims, new Date()).ok) return { ok: false, reason: 'reauthenticate' };
  const env = calendarEnv();
  if (env.CALENDAR_PROVIDER !== 'google') return { ok: false, reason: 'not_configured' };

  const { verifier, challenge } = createPkcePair();
  const state = createPkcePair().verifier;
  const cookieValue = signToken(
    'google_oauth',
    { state, verifier, userId: claims.sub },
    commercialEnv().PUBLIC_LINK_SECRET,
    new Date(Date.now() + OAUTH_COOKIE_TTL_MS),
  );
  return {
    ok: true,
    authorizationUrl: buildAuthorizationUrl({
      clientId: env.GOOGLE_CLIENT_ID,
      redirectUri: redirectUri(),
      state,
      codeChallenge: challenge,
    }),
    cookieValue,
    cookieMaxAgeSeconds: OAUTH_COOKIE_TTL_MS / 1000,
  };
}

export async function completeGoogleConnection(
  claims: VerifiedClaims,
  input: { code: string | null; state: string | null; cookieValue: string | undefined },
): Promise<{ ok: boolean }> {
  const env = calendarEnv();
  if (env.CALENDAR_PROVIDER !== 'google' || !input.code || !input.state || !input.cookieValue) {
    return { ok: false };
  }
  const stored = verifyToken(
    input.cookieValue,
    'google_oauth',
    commercialEnv().PUBLIC_LINK_SECRET,
    new Date(),
  );
  if (!stored || stored.state !== input.state || stored.userId !== claims.sub || !stored.verifier) {
    return { ok: false };
  }

  const tokens = await exchangeCode({
    code: input.code,
    codeVerifier: stored.verifier,
    redirectUri: redirectUri(),
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  });
  return saveGoogleConnection(claims, tokens, { contexts });
}

export async function disconnectGoogleCalendar(claims: VerifiedClaims): Promise<{ ok: boolean }> {
  if (!requireRecentMfa(claims, new Date()).ok) return { ok: false };
  return disconnectGoogle(claims, { contexts, revoke: (token) => revokeToken(token) });
}

export function hostCalendar(organizationId: string) {
  const env = calendarEnv();
  return getHostCalendar(organizationId, {
    contexts,
    provider: env.CALENDAR_PROVIDER,
    clientId: env.CALENDAR_PROVIDER === 'google' ? env.GOOGLE_CLIENT_ID : '',
    clientSecret: env.CALENDAR_PROVIDER === 'google' ? env.GOOGLE_CLIENT_SECRET : '',
  });
}

export async function isFounder(claims: VerifiedClaims): Promise<boolean> {
  return withUserContext(claims, async (tx) => {
    const actor = await resolveActor(tx, claims);
    return Boolean(actor?.mfaVerifiedAt && actor.roles.includes('founder'));
  });
}

export function googleOauthCookieName(secure: boolean): string {
  return secure ? '__Host-google-oauth' : 'google-oauth';
}
