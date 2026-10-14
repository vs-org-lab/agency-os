import { resolveTxt } from 'node:dns/promises';
import { createVercelDomains, type VercelDomains } from './vercel-domains';

/** DNS lookups and the hosting of client domains for the Brand Hub site (SEC-43, RF-095). */
export type DomainProvider = VercelDomains & {
  kind: 'vercel' | 'fake';
  /** The TXT records of a name, or null when the name does not exist. */
  txtRecords(name: string): Promise<string[][] | null>;
};

/** The TXT value the fake provider answers for every name under `verified.test`. */
export const FAKE_TXT = 'fake-domain-verification';

const NO_RECORD_CODES = new Set(['ENOTFOUND', 'ENODATA', 'ENONAME', 'NXDOMAIN']);

async function lookupTxt(name: string): Promise<string[][] | null> {
  try {
    return await resolveTxt(name);
  } catch (error) {
    if (NO_RECORD_CODES.has((error as { code?: string }).code ?? '')) return null;
    throw error;
  }
}

/** In-memory DNS and hosting for development and end-to-end tests. */
export function createFakeDomainProvider(): DomainProvider {
  return {
    kind: 'fake',
    async txtRecords(name) {
      return name.endsWith('.verified.test') ? [[FAKE_TXT]] : null;
    },
    async addDomain() {
      return { ok: true };
    },
    async removeDomain() {},
    async domainStatus() {
      return { configured: true, challenges: [] };
    },
  };
}

export function domainProviderFrom(
  source: Record<string, string | undefined>,
): DomainProvider | null {
  if (source.DOMAIN_PROVIDER === 'fake') return createFakeDomainProvider();
  const projectId = source.BRAND_HUB_VERCEL_PROJECT_ID;
  const teamId = source.BRAND_HUB_VERCEL_TEAM_ID;
  const token = source.BRAND_HUB_VERCEL_TOKEN;
  if (!projectId || !teamId || !token) return null;
  return {
    kind: 'vercel',
    txtRecords: lookupTxt,
    ...createVercelDomains({ projectId, teamId, token }),
  };
}

export function domainProvider(): DomainProvider | null {
  return domainProviderFrom({
    DOMAIN_PROVIDER: process.env.DOMAIN_PROVIDER,
    BRAND_HUB_VERCEL_PROJECT_ID: process.env.BRAND_HUB_VERCEL_PROJECT_ID,
    BRAND_HUB_VERCEL_TEAM_ID: process.env.BRAND_HUB_VERCEL_TEAM_ID,
    BRAND_HUB_VERCEL_TOKEN: process.env.BRAND_HUB_VERCEL_TOKEN,
  });
}
