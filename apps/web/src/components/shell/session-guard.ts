import 'server-only';
import { cache } from 'react';
import type { Locale } from '@agency-os/i18n';
import { redirect } from '@/i18n/navigation';
import { loadAccessContext, resolveActor, type AccessContext, type Actor } from '@/modules/access';
import { withUserContext, type VerifiedClaims } from '@/platform/db';
import { getSessionClaims } from '@/platform/session';
import { canPreviewClient, previewClaims, readPortalPreview } from './portal-preview';
import { resolveHome, type HomePath } from './routing';

export type AreaSession = {
  claims: VerifiedClaims;
  actor: Actor;
  ctx: AccessContext;
  /** Set while the team previews the portal as the client's decision maker. */
  preview?: { clientId: string };
};

// Layouts and pages of one request share the result instead of validating the session again.
export const requireArea = cache(async function requireArea(
  area: '/' | '/portal',
  locale: Locale,
): Promise<AreaSession> {
  const claims = await getSessionClaims();
  const session = claims
    ? await withUserContext(claims, async (tx) => {
        const actor = await resolveActor(tx, claims);
        return actor ? { actor, ctx: await loadAccessContext(tx, actor) } : null;
      })
    : null;

  const home: HomePath = resolveHome(session?.actor ?? null);
  if (claims && session && area === '/portal' && home === '/') {
    const clientId = await readPortalPreview();
    if (clientId && (await canPreviewClient(claims, clientId))) {
      return {
        claims: previewClaims(claims, clientId),
        actor: session.actor,
        ctx: {
          assignedClientIds: new Set(),
          clientRoles: new Map([[clientId, ['decision_maker'] as const]]),
        },
        preview: { clientId },
      };
    }
  }
  if (!claims || !session || home !== area) return redirect({ href: home, locale });

  return { claims, actor: session.actor, ctx: session.ctx };
});
