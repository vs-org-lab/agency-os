import { and, eq, ne } from 'drizzle-orm';
import { schema, type BrandHubAccessMode } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { VerifiedClaims } from '@/platform/db';
import {
  editableHub,
  hubEditor,
  INVALID_INPUT,
  INVALID_STATE,
  lockHub,
  NOT_FOUND,
  OK,
  type BrandHubDeps,
  type NotFound,
} from './access';
import { hashPassword } from './domain/passwords';
import { isValidSlug } from './domain/slug';

const { brandHubs } = schema;

const ACCESS_MODES = new Set<string>(['public', 'password', 'restricted']);
const MIN_PASSWORD = 10;
const MAX_PASSWORD = 128;

export type HubSharingView = {
  hubId: string;
  slug: string;
  mode: BrandHubAccessMode;
  hasPassword: boolean;
  /** The hub's address on the published site; null when the site is not configured. */
  siteUrl: string | null;
  published: boolean;
};

export function siteAddress(site: BrandHubDeps['site'], slug: string): string | null {
  return site ? `${site.url.replace(/\/+$/, '')}/${slug}/` : null;
}

/** The painel Partilha: where the site lives and who may open it, for whoever publishes. */
export async function loadHubSharing(
  claims: VerifiedClaims,
  clientId: string,
  deps: BrandHubDeps,
): Promise<HubSharingView | null> {
  const editor = await hubEditor(claims, clientId, deps);
  if (!editor?.canPublish) return null;
  const [hub] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        id: brandHubs.id,
        slug: brandHubs.slug,
        mode: brandHubs.accessMode,
        passwordHash: brandHubs.passwordHash,
        publishedPublicationId: brandHubs.publishedPublicationId,
      })
      .from(brandHubs)
      .where(eq(brandHubs.clientId, clientId)),
  );
  if (!hub) return null;
  return {
    hubId: hub.id,
    slug: hub.slug,
    mode: hub.mode,
    hasPassword: hub.passwordHash !== null,
    siteUrl: siteAddress(deps.site, hub.slug),
    published: hub.publishedPublicationId !== null,
  };
}

/**
 * Sets the hub's site address and who may open it (RF-096). Entering password mode needs a
 * password; staying in it may keep the current one. Any change of mode or password raises the
 * access version, so tokens issued before stop working.
 */
export async function updateHubSharing(
  claims: VerifiedClaims,
  input: { hubId: string; slug: string; mode: string; password?: string },
  deps: BrandHubDeps,
): Promise<typeof OK | NotFound | typeof INVALID_INPUT | typeof INVALID_STATE> {
  const access = await editableHub(claims, { kind: 'hub', id: input.hubId }, deps);
  if (!access?.editor.canPublish) return NOT_FOUND;
  const slug = input.slug.trim();
  const password = input.password ?? '';
  if (!isValidSlug(slug) || !ACCESS_MODES.has(input.mode)) return INVALID_INPUT;
  if (password !== '' && (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD)) {
    return INVALID_INPUT;
  }
  const mode = input.mode as BrandHubAccessMode;
  const passwordHash = mode === 'password' && password !== '' ? await hashPassword(password) : null;
  const now = (deps.now ?? (() => new Date()))();

  return deps.contexts.withSystemContext(async (tx) => {
    const hub = await lockHub(tx, access.hubId);
    if (!hub) return NOT_FOUND;
    const [current] = await tx
      .select({ mode: brandHubs.accessMode, passwordHash: brandHubs.passwordHash })
      .from(brandHubs)
      .where(eq(brandHubs.id, hub.id));
    if (!current) return NOT_FOUND;
    if (mode === 'password' && !passwordHash && !current.passwordHash) return INVALID_INPUT;
    const [taken] = await tx
      .select({ id: brandHubs.id })
      .from(brandHubs)
      .where(and(eq(brandHubs.slug, slug), ne(brandHubs.id, hub.id)));
    if (taken) return INVALID_STATE;

    const nextHash = mode === 'password' ? (passwordHash ?? current.passwordHash) : null;
    const accessChanged = mode !== current.mode || passwordHash !== null;
    await tx
      .update(brandHubs)
      .set({
        slug,
        accessMode: mode,
        passwordHash: nextHash,
        ...(accessChanged ? { accessVersion: hub.accessVersion + 1 } : {}),
        updatedAt: now,
      })
      .where(eq(brandHubs.id, hub.id));
    await recordAudit(tx, {
      organizationId: hub.organizationId,
      action: 'brand_hub.access_changed',
      resourceType: 'brand_hub',
      resourceId: hub.id,
      clientId: hub.clientId,
      metadata: { slug, mode, passwordChanged: passwordHash !== null },
    });
    return OK;
  });
}
