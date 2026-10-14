import { and, eq, inArray, sql } from 'drizzle-orm';
import { schema, type BrandHubAccessMode } from '@agency-os/db';
import { consumeThrottle } from '@/modules/commercial/server';
import { LIBRARY_LINK_TTL_SECONDS, type ZipManifest } from '@/modules/library';
import type { VerifiedClaims } from '@/platform/db';
import {
  hubEditor,
  NOT_FOUND,
  type BrandHubDeps,
  type BrandHubSite,
  type NotFound,
} from './access';
import { normaliseHostname } from './domain/hostname';
import { verifyPassword } from './domain/passwords';
import type { HubSnapshot } from './domain/snapshot';
import { signHubToken, verifyHubToken, type HubTokenMode } from './domain/tokens';
import { clientName } from './readers';
import { buildHubManifest } from './zip';

const { brandHubAssets, brandHubDomains, brandHubPublications, brandHubs } = schema;

const PASSWORD_TOKEN_MS = 7 * 24 * 60 * 60 * 1000;
const RESTRICTED_TOKEN_MS = 12 * 60 * 60 * 1000;
const UNLOCK_LIMIT = 5;
const UNLOCK_WINDOW_SECONDS = 15 * 60;

export type PublicHub = {
  snapshot: HubSnapshot;
  clientName: string;
  publishedAt: string;
  /** Links of 15 minutes to each file of the publication, by asset id. */
  assetUrls: Record<string, string>;
};

export type PublicHubResult =
  | { status: 200; hub: PublicHub }
  | { status: 401; mode: 'password' | 'restricted'; clientName: string }
  | { status: 404 };

type SiteHub = {
  id: string;
  organizationId: string;
  clientId: string;
  mode: BrandHubAccessMode;
  passwordHash: string | null;
  accessVersion: number;
  publicationId: string | null;
};

function siteConfig(deps: BrandHubDeps): BrandHubSite {
  if (!deps.site) throw new Error('The brand hub site is not configured');
  return deps.site;
}

async function hubBySlug(slug: string, deps: BrandHubDeps): Promise<SiteHub | null> {
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  const [hub] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        id: brandHubs.id,
        organizationId: brandHubs.organizationId,
        clientId: brandHubs.clientId,
        mode: brandHubs.accessMode,
        passwordHash: brandHubs.passwordHash,
        accessVersion: brandHubs.accessVersion,
        publicationId: brandHubs.publishedPublicationId,
      })
      .from(brandHubs)
      .where(eq(brandHubs.slug, slug)),
  );
  return hub ?? null;
}

/** Whether the visitor may read the hub: a public hub, or a token for its current mode and version. */
function admitted(hub: SiteHub, token: string | null, deps: BrandHubDeps): boolean {
  if (hub.mode === 'public') return true;
  if (!token) return false;
  const now = (deps.now ?? (() => new Date()))();
  const claims = verifyHubToken(token, siteConfig(deps).tokenSecret, now);
  return (
    claims !== null &&
    claims.hubId === hub.id &&
    claims.mode === hub.mode &&
    claims.version === hub.accessVersion
  );
}

async function publication(
  publicationId: string,
  deps: BrandHubDeps,
): Promise<{ snapshot: HubSnapshot; publishedAt: Date } | null> {
  const [row] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        snapshot: brandHubPublications.snapshot,
        publishedAt: brandHubPublications.publishedAt,
      })
      .from(brandHubPublications)
      .where(eq(brandHubPublications.id, publicationId)),
  );
  return row ? { snapshot: row.snapshot as HubSnapshot, publishedAt: row.publishedAt } : null;
}

/**
 * The published site's read of a hub (H-03, SEC-40): the current publication when the hub is public
 * or the token admits the visitor; otherwise only the mode and the client's name.
 */
export async function readPublicHub(
  slug: string,
  token: string | null,
  deps: BrandHubDeps,
): Promise<PublicHubResult> {
  const hub = await hubBySlug(slug, deps);
  if (!hub?.publicationId) return { status: 404 };
  if (!admitted(hub, token, deps)) {
    return {
      status: 401,
      mode: hub.mode === 'password' ? 'password' : 'restricted',
      clientName: await clientName(hub.clientId, deps),
    };
  }
  const published = await publication(hub.publicationId, deps);
  if (!published) return { status: 404 };
  const ids = published.snapshot.assets.map((asset) => asset.id);
  const stored =
    ids.length === 0
      ? []
      : await deps.contexts.withSystemContext((tx) =>
          tx
            .select({ id: brandHubAssets.id, storagePath: brandHubAssets.storagePath })
            .from(brandHubAssets)
            .where(inArray(brandHubAssets.id, ids)),
        );
  const assetUrls: Record<string, string> = {};
  for (const asset of stored) {
    assetUrls[asset.id] = await deps.storage.signedUrl(asset.storagePath, LIBRARY_LINK_TTL_SECONDS);
  }
  return {
    status: 200,
    hub: {
      snapshot: published.snapshot,
      clientName: await clientName(hub.clientId, deps),
      publishedAt: published.publishedAt.toISOString(),
      assetUrls,
    },
  };
}

export type DomainHubResult =
  | { status: 200; hub: PublicHub; slug: string }
  | { status: 401; mode: 'password' | 'restricted'; clientName: string; slug: string }
  | { status: 404 };

/** The slug of the hub a connected client domain serves, or null. */
async function slugByDomain(host: string, deps: BrandHubDeps): Promise<string | null> {
  const hostname = normaliseHostname(host);
  if (!hostname) return null;
  const [row] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ slug: brandHubs.slug })
      .from(brandHubDomains)
      .innerJoin(brandHubs, eq(brandHubs.id, brandHubDomains.hubId))
      .where(and(eq(brandHubDomains.hostname, hostname), eq(brandHubDomains.status, 'connected'))),
  );
  return row?.slug ?? null;
}

/**
 * The hub on the client's own domain (RF-095): the same answer as by slug, with the slug so the
 * site can unlock, download and keep its token. Domains not yet connected are not found.
 */
export async function readPublicHubByDomain(
  host: string,
  token: string | null,
  deps: BrandHubDeps,
): Promise<DomainHubResult> {
  const slug = await slugByDomain(host, deps);
  if (!slug) return { status: 404 };
  const result = await readPublicHub(slug, token, deps);
  return result.status === 404 ? result : { ...result, slug };
}

/** Whether an origin may call the public API: the site's configured origins or a connected domain. */
export async function isSiteOrigin(origin: string, deps: BrandHubDeps): Promise<boolean> {
  if (deps.site?.origins.includes(origin)) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.origin !== origin) return false;
  return (await slugByDomain(url.hostname, deps)) !== null;
}

/** The ZIP manifest of one page or of every asset, under the same rule as the hub itself. */
export async function publicHubZip(
  slug: string,
  token: string | null,
  pageId: string | null,
  deps: BrandHubDeps,
): Promise<
  { status: 200; manifest: Extract<ZipManifest, { ok: true }> } | { status: 401 | 404 | 413 }
> {
  const hub = await hubBySlug(slug, deps);
  if (!hub?.publicationId) return { status: 404 };
  if (!admitted(hub, token, deps)) return { status: 401 };
  const published = await publication(hub.publicationId, deps);
  if (!published) return { status: 404 };
  const manifest = await buildHubManifest(published.snapshot, hub.clientId, pageId, deps);
  if (manifest.ok) return { status: 200, manifest };
  return { status: manifest.rule === 'zip_too_large' ? 413 : 404 };
}

function issue(hub: SiteHub, mode: HubTokenMode, lifetimeMs: number, deps: BrandHubDeps): string {
  const now = (deps.now ?? (() => new Date()))();
  return signHubToken(
    {
      hubId: hub.id,
      mode,
      version: hub.accessVersion,
      expiresAt: new Date(now.getTime() + lifetimeMs),
    },
    siteConfig(deps).tokenSecret,
  );
}

/**
 * The password gate (RF-096, SEC-42): every attempt counts against five per hub and address in 15
 * minutes, and the right password returns a token of seven days.
 */
export async function unlockHub(
  slug: string,
  password: string,
  ip: string,
  deps: BrandHubDeps,
): Promise<
  { ok: true; token: string } | { ok: false; rule: 'not_found' | 'invalid_input' | 'rate_limited' }
> {
  const hub = await hubBySlug(slug, deps);
  if (!hub?.publicationId || hub.mode !== 'password' || !hub.passwordHash) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();
  const allowed = await deps.contexts.withSystemContext((tx) =>
    consumeThrottle(tx, {
      organizationId: hub.organizationId,
      kind: 'hub_unlock',
      key: `${hub.id}:${ip}`,
      limit: UNLOCK_LIMIT,
      windowSeconds: UNLOCK_WINDOW_SECONDS,
      now,
      secret: siteConfig(deps).tokenSecret,
    }),
  );
  if (!allowed) return { ok: false, rule: 'rate_limited' };
  if (password.length > 256 || !(await verifyPassword(password, hub.passwordHash))) {
    return { ok: false, rule: 'invalid_input' };
  }
  return { ok: true, token: issue(hub, 'password', PASSWORD_TOKEN_MS, deps) };
}

/** The connected client domain of a hub, as an origin, or null. */
async function connectedOrigin(hubId: string, deps: BrandHubDeps): Promise<string | null> {
  const [row] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ hostname: brandHubDomains.hostname })
      .from(brandHubDomains)
      .where(and(eq(brandHubDomains.hubId, hubId), eq(brandHubDomains.status, 'connected'))),
  );
  return row ? `https://${row.hostname}` : null;
}

/** Whether a return address is the site's configured origin or the hub's own connected domain. */
async function allowedReturn(
  returnTo: string,
  hubId: string | null,
  deps: BrandHubDeps,
): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(returnTo);
  } catch {
    return false;
  }
  if (siteConfig(deps).origins.includes(url.origin)) return true;
  return hubId !== null && url.origin === (await connectedOrigin(hubId, deps));
}

/**
 * The restricted gate: a signed-in decision maker or operational user of the hub's client, or
 * someone who edits the hub, goes back to the site with a token of 12 hours in the fragment.
 */
export async function issueRestrictedToken(
  claims: VerifiedClaims,
  slug: string,
  returnTo: string,
  deps: BrandHubDeps,
): Promise<{ ok: true; redirect: string } | NotFound | { ok: false; rule: 'invalid_input' }> {
  const hub = await hubBySlug(slug, deps);
  if (!(await allowedReturn(returnTo, hub?.id ?? null, deps))) {
    return { ok: false, rule: 'invalid_input' };
  }
  if (!hub?.publicationId || hub.mode !== 'restricted') return NOT_FOUND;
  const member =
    claims.user_kind === 'client'
      ? await deps.contexts.withUserContext(claims, async (tx) => {
          const rows = await tx.execute<{ allowed: boolean }>(sql`
            select app.is_client_member(
              ${hub.clientId}::uuid, array['decision_maker', 'operational']::app.client_role[]
            ) as allowed
          `);
          return rows[0]?.allowed === true;
        })
      : (await hubEditor(claims, hub.clientId, deps)) !== null;
  if (!member) return NOT_FOUND;
  const url = new URL(returnTo);
  url.hash = `token=${issue(hub, 'restricted', RESTRICTED_TOKEN_MS, deps)}`;
  return { ok: true, redirect: url.toString() };
}
