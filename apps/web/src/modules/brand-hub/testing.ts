import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { testDatabase } from '@agency-os/db/testing';
import type { LibraryStorage } from '@/modules/library';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import type { DomainProvider } from '@/platform/domain-provider';
import type { DomainStatus } from '@/platform/vercel-domains';
import type { BrandHubDeps } from './access';

export const HUB_TEST_NOW = new Date('2026-10-12T09:00:00Z');

export const HUB_TEST_SITE = {
  url: 'https://hubs.example.com',
  origins: ['https://hubs.example.com'],
  tokenSecret: 'brand-hub-test-secret-0123456789abcdef',
};

export const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

/** A JPEG whose APP1 segment carries a GPS position, as phones write it. */
export const JPEG_WITH_GPS = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x47, 0x50,
  0x53, 0x20, 0x33, 0x38, 0x2e, 0x37, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0x11, 0x22, 0xff, 0xd9,
]);

export const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n%âãÏÓ\n1 0 obj\n');

export function hubClaims(
  userId: string,
  userKind: 'internal' | 'client' = 'internal',
): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: userKind === 'internal' ? 'aal2' : 'aal1',
    session_id: randomUUID(),
    amr: [
      {
        method: userKind === 'internal' ? 'totp' : 'otp',
        timestamp: Math.floor(Date.now() / 1000),
      },
    ],
    user_kind: userKind,
  };
}

function memoryStorage(): LibraryStorage & { files: Map<string, Uint8Array>; removed: string[] } {
  const files = new Map<string, Uint8Array>();
  const removed: string[] = [];
  const remove = async (path: string) => {
    files.delete(path);
    removed.push(path);
  };
  return {
    files,
    removed,
    createUploadUrl: async (path) => `memory://upload/${path}`,
    download: async (path) => files.get(path) ?? null,
    exists: async (path) => files.has(path),
    signedDownloadUrl: async (path, ttlSeconds, fileName) =>
      `memory://file/${path}?ttl=${ttlSeconds}&download=${encodeURIComponent(fileName)}`,
    signedUrl: async (path, ttlSeconds) => `memory://file/${path}?ttl=${ttlSeconds}`,
    upload: async (path, bytes) => {
      files.set(path, bytes);
    },
    remove,
    removeMany: async (paths) => {
      for (const path of paths) await remove(path);
    },
  };
}

export function hubDeps(sql: TransactionSql) {
  const storage = memoryStorage();
  const flushes: number[] = [];
  const deps: BrandHubDeps = {
    contexts: createDbContexts(testDatabase(sql)),
    storage,
    flush: async () => {
      flushes.push(1);
    },
    now: () => HUB_TEST_NOW,
    site: HUB_TEST_SITE,
  };
  return { deps, storage, flushes };
}

/** DNS and hosting held in memory: TXT records by name, and every hosting call in order. */
export function memoryDomainProvider() {
  const txt = new Map<string, string[][]>();
  const calls: [string, string][] = [];
  const provider: DomainProvider & {
    txt: Map<string, string[][]>;
    calls: [string, string][];
    refuse: string | null;
    failRemoval: boolean;
    status: DomainStatus;
    /** Runs while the hosting call is in flight, to reproduce concurrent changes. */
    duringAdd: (() => Promise<void>) | null;
  } = {
    kind: 'fake',
    txt,
    calls,
    refuse: null,
    failRemoval: false,
    status: { configured: true, challenges: [] },
    duringAdd: null,
    async txtRecords(name) {
      return txt.get(name) ?? null;
    },
    async addDomain(host) {
      if (provider.refuse) return { ok: false, message: provider.refuse };
      calls.push(['add', host]);
      await provider.duringAdd?.();
      return { ok: true };
    },
    async removeDomain(host) {
      calls.push(['remove', host]);
      if (provider.failRemoval) throw new Error('Vercel domain removal failed with 500');
    },
    async domainStatus() {
      return provider.status;
    },
  };
  return provider;
}
