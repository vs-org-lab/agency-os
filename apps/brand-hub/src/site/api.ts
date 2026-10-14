import type { HubSnapshot } from '@agency-os/brand-hub-view';

export type SiteHub = {
  snapshot: HubSnapshot;
  clientName: string;
  publishedAt: string;
  assetUrls: Record<string, string>;
};

export type HubResult =
  | { status: 200; hub: SiteHub }
  | { status: 401; mode: 'password' | 'restricted'; clientName: string }
  | { status: 404 }
  | { status: 'error' };

export type ZipManifest = { archiveName: string; entries: { path: string; url: string }[] };

export type SiteApi = {
  loadHub(slug: string, token: string | null): Promise<HubResult>;
  unlock(
    slug: string,
    password: string,
  ): Promise<{ status: 200; token: string } | { status: 401 | 404 | 429 | 'error' }>;
  zip(
    slug: string,
    token: string | null,
    pageId: string | null,
  ): Promise<{ status: 200; manifest: ZipManifest } | { status: 401 | 404 | 413 | 'error' }>;
  accessUrl(slug: string, returnTo: string): string;
};

const authorization = (token: string | null): HeadersInit =>
  token ? { authorization: `Bearer ${token}` } : {};

/** The OS public Brand Hub API (2F.2), the only data source of this static site (SEC-40). */
export function createSiteApi(osUrl: string, fetcher: typeof fetch = fetch): SiteApi {
  const base = osUrl.replace(/\/+$/, '');
  const hubPath = (slug: string) => `${base}/api/public/hubs/${encodeURIComponent(slug)}`;

  return {
    async loadHub(slug, token) {
      const response = await fetcher(hubPath(slug), { headers: authorization(token) }).catch(
        () => null,
      );
      if (!response) return { status: 'error' };
      if (response.status === 200) return { status: 200, hub: (await response.json()) as SiteHub };
      if (response.status === 401) {
        const body = (await response.json()) as {
          mode: 'password' | 'restricted';
          clientName: string;
        };
        return { status: 401, mode: body.mode, clientName: body.clientName };
      }
      return response.status === 404 ? { status: 404 } : { status: 'error' };
    },
    async unlock(slug, password) {
      const response = await fetcher(`${hubPath(slug)}/unlock`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      }).catch(() => null);
      if (!response) return { status: 'error' };
      if (response.status === 200) {
        return { status: 200, token: ((await response.json()) as { token: string }).token };
      }
      return response.status === 401 || response.status === 404 || response.status === 429
        ? { status: response.status }
        : { status: 'error' };
    },
    async zip(slug, token, pageId) {
      const query = pageId ? `?page=${encodeURIComponent(pageId)}` : '';
      const response = await fetcher(`${hubPath(slug)}/zip${query}`, {
        headers: authorization(token),
      }).catch(() => null);
      if (!response) return { status: 'error' };
      if (response.status === 200) {
        return { status: 200, manifest: (await response.json()) as ZipManifest };
      }
      return response.status === 401 || response.status === 404 || response.status === 413
        ? { status: response.status }
        : { status: 'error' };
    },
    accessUrl(slug, returnTo) {
      return `${base}/pt-PT/hub-access/${encodeURIComponent(slug)}?return=${encodeURIComponent(returnTo)}`;
    },
  };
}
