import 'server-only';
import { sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { withUserContext, type PreviewRole, type VerifiedClaims } from '@/platform/db';
import { parsePreviewCookie, PORTAL_PREVIEW_COOKIE } from './portal-preview-path';

export type PortalPreview = { clientId: string; role: PreviewRole };

/** The client and role named by the preview cookie, which the browser sends to portal paths only. */
export async function readPortalPreview(): Promise<PortalPreview | null> {
  return parsePreviewCookie((await cookies()).get(PORTAL_PREVIEW_COOKIE)?.value);
}

/** The founder, or the project manager assigned to the client (app.can_preview_client). */
export async function canPreviewClient(claims: VerifiedClaims, clientId: string) {
  if (claims.user_kind === 'client' || !z.uuid().safeParse(clientId).success) return false;
  const [row] = await withUserContext(claims, (tx) =>
    tx.execute<{ allowed: boolean }>(
      sql`select app.can_preview_client(${clientId}::uuid) as allowed`,
    ),
  );
  return row?.allowed === true;
}

/** The staff claims read as the chosen client role: read-only in the database. */
export function previewClaims(claims: VerifiedClaims, preview: PortalPreview): VerifiedClaims {
  return {
    ...claims,
    user_kind: 'client',
    preview_client: preview.clientId,
    preview_role: preview.role,
  };
}
