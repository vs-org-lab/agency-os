import { randomBytes } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import { schema, type BrandHubDomainStatus, type DbTransaction } from '@agency-os/db';
import { recordAudit, type AuditAction } from '@/modules/audit';
import { consumeThrottle } from '@/modules/commercial/server';
import type { VerifiedClaims } from '@/platform/db';
import { FAKE_TXT, type DomainProvider } from '@/platform/domain-provider';
import { logger } from '@/platform/logger';
import type { DomainChallenge } from '@/platform/vercel-domains';
import {
  editableHub,
  INVALID_INPUT,
  INVALID_STATE,
  lockHub,
  NOT_FOUND,
  OK,
  type BrandHubDeps,
  type LockedHub,
  type NotFound,
} from './access';
import { normaliseHostname } from './domain/hostname';

const { brandHubDomains, brandHubs } = schema;

const VERIFICATION_PREFIX = '_agency-os.';
export const CNAME_TARGET = 'cname.vercel-dns.com';
const CHECK_LIMIT = 10;
const CHECK_WINDOW_SECONDS = 15 * 60;
/** The throttle key is the hub id, which is not personal data; the hash only needs to be stable. */
const CHECK_THROTTLE_SECRET = 'brand-hub-domain-check';

export const UNAVAILABLE = { ok: false, rule: 'unavailable' } as const;
export const NOT_APPROVED = { ok: false, rule: 'not_approved' } as const;

export type HubDomainView = {
  hostname: string;
  status: BrandHubDomainStatus;
  verificationName: string;
  verificationCode: string;
  cnameTarget: string;
  /** Whether Vercel serves the domain; read only once the domain is connected. */
  configured: boolean | null;
  /** Records Vercel asks for before serving a domain another account already holds. */
  challenges: DomainChallenge[];
};

export type HubDomainState = {
  available: boolean;
  /** Whether the client has approved a publication, which the first connection needs (RN-81). */
  approved: boolean;
  domain: HubDomainView | null;
};

type DomainRow = typeof brandHubDomains.$inferSelect;

async function publishableHub(claims: VerifiedClaims, hubId: string, deps: BrandHubDeps) {
  const access = await editableHub(claims, { kind: 'hub', id: hubId }, deps);
  return access?.editor.canPublish ? access.hubId : null;
}

async function currentDomain(tx: DbTransaction, hubId: string): Promise<DomainRow | null> {
  const [row] = await tx.select().from(brandHubDomains).where(eq(brandHubDomains.hubId, hubId));
  return row ?? null;
}

/** Runs `change` with the hub locked and its domain, as one transaction. */
function withHubDomain<T>(
  hubId: string,
  deps: BrandHubDeps,
  change: (tx: DbTransaction, hub: LockedHub, domain: DomainRow | null) => Promise<T>,
): Promise<T | NotFound> {
  return deps.contexts.withSystemContext(async (tx) => {
    const hub = await lockHub(tx, hubId);
    if (!hub) return NOT_FOUND;
    return change(tx, hub, await currentDomain(tx, hub.id));
  });
}

async function audit(
  tx: DbTransaction,
  hub: LockedHub,
  action: AuditAction,
  metadata: Record<string, unknown>,
): Promise<void> {
  await recordAudit(tx, {
    organizationId: hub.organizationId,
    action,
    resourceType: 'brand_hub',
    resourceId: hub.id,
    clientId: hub.clientId,
    metadata,
  });
}

const now = (deps: BrandHubDeps) => (deps.now ?? (() => new Date()))();

/**
 * Takes a domain off the site's hosting after the database no longer holds it. The database
 * outcome stands either way; a hosting failure is logged so the domain can be removed by hand.
 */
async function releaseDomain(provider: DomainProvider, hostname: string): Promise<void> {
  await provider.removeDomain(hostname).catch((error: unknown) => {
    logger.error('brand_hub.domain_release_failed', { hostname, error });
  });
}

/** The domain section of the painel Partilha, for whoever publishes the hub. */
export async function loadHubDomain(
  claims: VerifiedClaims,
  hubId: string,
  deps: BrandHubDeps,
): Promise<HubDomainState | NotFound> {
  const id = await publishableHub(claims, hubId, deps);
  if (!id) return NOT_FOUND;
  const { row, approved } = await deps.contexts.withSystemContext(async (tx) => {
    const [hub] = await tx
      .select({ approvedPublicationId: brandHubs.approvedPublicationId })
      .from(brandHubs)
      .where(eq(brandHubs.id, id));
    return { row: await currentDomain(tx, id), approved: Boolean(hub?.approvedPublicationId) };
  });
  const available = deps.domains !== undefined;
  if (!row) return { available, approved, domain: null };
  const status =
    row.status === 'connected' && deps.domains
      ? await deps.domains
          .domainStatus(row.hostname)
          .catch(() => ({ configured: false, challenges: [] }))
      : { configured: null, challenges: [] };
  return {
    available,
    approved,
    domain: {
      hostname: row.hostname,
      status: row.status,
      verificationName: `${VERIFICATION_PREFIX}${row.hostname}`,
      verificationCode: row.verificationCode,
      cnameTarget: CNAME_TARGET,
      configured: status.configured,
      challenges: status.challenges,
    },
  };
}

/**
 * Sets the client's address for the hub. A new address starts over with a new code; the previous
 * one, if it was connected, leaves the site's hosting.
 */
export async function setHubDomain(
  claims: VerifiedClaims,
  input: { hubId: string; hostname: string },
  deps: BrandHubDeps,
): Promise<typeof OK | NotFound | typeof INVALID_INPUT | typeof UNAVAILABLE> {
  const hubId = await publishableHub(claims, input.hubId, deps);
  if (!hubId) return NOT_FOUND;
  const provider = deps.domains;
  if (!provider) return UNAVAILABLE;
  const hostname = normaliseHostname(input.hostname);
  if (!hostname) return INVALID_INPUT;

  const result = await withHubDomain(hubId, deps, async (tx, hub, previous) => {
    if (previous?.hostname === hostname) return { outcome: OK, released: null };
    const [taken] = await tx
      .select({ id: brandHubDomains.id })
      .from(brandHubDomains)
      .where(and(eq(brandHubDomains.hostname, hostname), ne(brandHubDomains.hubId, hub.id)));
    if (taken) return { outcome: INVALID_INPUT, released: null };
    if (previous) await tx.delete(brandHubDomains).where(eq(brandHubDomains.id, previous.id));
    await tx.insert(brandHubDomains).values({
      organizationId: hub.organizationId,
      clientId: hub.clientId,
      hubId: hub.id,
      hostname,
      verificationCode: randomBytes(24).toString('base64url'),
      createdBy: claims.sub,
      createdAt: now(deps),
      updatedAt: now(deps),
    });
    await audit(tx, hub, 'brand_hub.domain_set', { hostname });
    return {
      outcome: OK,
      released: previous?.status === 'connected' ? previous.hostname : null,
    };
  });
  if ('rule' in result) return result;
  if (result.released) await releaseDomain(provider, result.released);
  return result.outcome;
}

function codeFound(records: string[][], code: string, provider: DomainProvider): boolean {
  return records
    .map((chunks) => chunks.join(''))
    .some((value) => value === code || (provider.kind === 'fake' && value === FAKE_TXT));
}

/** Reads the TXT record that proves the client controls the address (SEC-43). */
export async function verifyHubDomain(
  claims: VerifiedClaims,
  hubId: string,
  deps: BrandHubDeps,
): Promise<
  | typeof OK
  | NotFound
  | typeof INVALID_STATE
  | typeof UNAVAILABLE
  | { ok: false; rule: 'rate_limited' }
  | { ok: false; rule: 'invalid_input'; reason: 'missing' | 'mismatch' }
> {
  const id = await publishableHub(claims, hubId, deps);
  if (!id) return NOT_FOUND;
  const provider = deps.domains;
  if (!provider) return UNAVAILABLE;
  const domain = await deps.contexts.withSystemContext(async (tx) => {
    const row = await currentDomain(tx, id);
    if (!row || row.status !== 'pending') return { row, allowed: true };
    const allowed = await consumeThrottle(tx, {
      organizationId: row.organizationId,
      kind: 'hub_domain_check',
      key: id,
      limit: CHECK_LIMIT,
      windowSeconds: CHECK_WINDOW_SECONDS,
      now: now(deps),
      secret: CHECK_THROTTLE_SECRET,
    });
    return { row, allowed };
  });
  if (!domain.row) return NOT_FOUND;
  if (domain.row.status !== 'pending') return INVALID_STATE;
  if (!domain.allowed) return { ok: false, rule: 'rate_limited' };

  const records = await provider.txtRecords(`${VERIFICATION_PREFIX}${domain.row.hostname}`);
  if (!records || records.length === 0) {
    return { ok: false, rule: 'invalid_input', reason: 'missing' };
  }
  if (!codeFound(records, domain.row.verificationCode, provider)) {
    return { ok: false, rule: 'invalid_input', reason: 'mismatch' };
  }
  const expected = domain.row;
  return withHubDomain(id, deps, async (tx, hub, current) => {
    if (current?.id !== expected.id || current.status !== 'pending') return INVALID_STATE;
    await tx
      .update(brandHubDomains)
      .set({ status: 'verified', verifiedAt: now(deps), updatedAt: now(deps) })
      .where(eq(brandHubDomains.id, current.id));
    await audit(tx, hub, 'brand_hub.domain_verified', { hostname: current.hostname });
    return OK;
  });
}

/**
 * Adds a verified address to the site's hosting. The first time a hub goes to a client domain it
 * must carry the client's approval (RN-81); later publications reach it without a new one.
 */
export async function connectHubDomain(
  claims: VerifiedClaims,
  hubId: string,
  deps: BrandHubDeps,
): Promise<
  | typeof OK
  | NotFound
  | typeof INVALID_STATE
  | typeof UNAVAILABLE
  | typeof NOT_APPROVED
  | { ok: false; rule: 'provider_error'; message: string }
> {
  const id = await publishableHub(claims, hubId, deps);
  if (!id) return NOT_FOUND;
  const provider = deps.domains;
  if (!provider) return UNAVAILABLE;
  const ready = await withHubDomain(id, deps, async (_tx, hub, domain) => {
    if (!domain || domain.status !== 'verified') return INVALID_STATE;
    if (!hub.publishedPublicationId || !hub.approvedPublicationId) return NOT_APPROVED;
    return { ok: true as const, domain };
  });
  if (!ready.ok) return ready;

  const hostname = ready.domain.hostname;
  const added = await provider.addDomain(hostname);
  if (!added.ok) return { ok: false, rule: 'provider_error', message: added.message };
  const outcome = await withHubDomain(id, deps, async (tx, hub, current) => {
    if (current?.hostname === hostname && current.status === 'connected') return INVALID_STATE;
    if (current?.id !== ready.domain.id || current.status !== 'verified') {
      return { ...INVALID_STATE, release: true };
    }
    await tx
      .update(brandHubDomains)
      .set({ status: 'connected', connectedAt: now(deps), updatedAt: now(deps) })
      .where(eq(brandHubDomains.id, current.id));
    await audit(tx, hub, 'brand_hub.domain_connected', { hostname: current.hostname });
    return OK;
  });
  // The domain changed while it was being added; the hosting no longer matches the hub.
  if ('release' in outcome) {
    await releaseDomain(provider, hostname);
    return INVALID_STATE;
  }
  return outcome;
}

/** Removes the address from the hub and, when connected, from the site's hosting. */
export async function removeHubDomain(
  claims: VerifiedClaims,
  hubId: string,
  deps: BrandHubDeps,
): Promise<typeof OK | NotFound | typeof UNAVAILABLE> {
  const id = await publishableHub(claims, hubId, deps);
  if (!id) return NOT_FOUND;
  const provider = deps.domains;
  if (!provider) return UNAVAILABLE;
  const removed = await withHubDomain(id, deps, async (tx, hub, domain) => {
    if (!domain) return null;
    await tx.delete(brandHubDomains).where(eq(brandHubDomains.id, domain.id));
    await audit(tx, hub, 'brand_hub.domain_removed', { hostname: domain.hostname });
    return domain;
  });
  if (removed && 'rule' in removed) return removed;
  if (removed?.status === 'connected') await releaseDomain(provider, removed.hostname);
  return OK;
}
