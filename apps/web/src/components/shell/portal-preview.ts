import 'server-only';
import { sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { withUserContext, type VerifiedClaims } from '@/platform/db';
import { PORTAL_PREVIEW_COOKIE } from './portal-preview-path';

/** The client named by the preview cookie, which the browser sends to portal paths only. */
export async function readPortalPreview(): Promise<string | null> {
  const value = (await cookies()).get(PORTAL_PREVIEW_COOKIE)?.value;
  return value && z.uuid().safeParse(value).success ? value : null;
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

/** The staff claims read as the client's decision maker: read-only in the database. */
export function previewClaims(claims: VerifiedClaims, clientId: string): VerifiedClaims {
  return { ...claims, user_kind: 'client', preview_client: clientId };
}
