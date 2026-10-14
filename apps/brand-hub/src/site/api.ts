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
  manual(
    slug: string,
    token: string | null,
  ): Promise<{ status: 200; url: string; fileName: string } | { status: 401 | 404 | 'error' }>;
  /** The hub a client's own domain serves (RF-095), with the slug the other calls take. */
  loadHubByDomain(
    host: string,
    token: string | null,
  ): Promise<{ slug: string | null; result: HubResult }>;
  accessUrl(slug: string, returnTo: string): string;
};

const authorization = (token: string | null): HeadersInit =>
  token ? { authorization: `Bearer ${token}` } : {};

/** The hub answer of the OS, by slug or by domain, with the slug when the OS sends it. */
async function readHub(
  response: Response | null,
): Promise<{ slug: string | null; result: HubResult }> {
  if (!response) return { slug: null, result: { status: 'error' } };
  if (response.status === 200) {
    const { slug = null, ...hub } = (await response.json()) as SiteHub & { slug?: string };
    return { slug, result: { status: 200, hub } };
  }
  if (response.status === 401) {
    const body = (await response.json()) as {
      mode: 'password' | 'restricted';
      clientName: string;
      slug?: string;
    };
    return {
      slug: body.slug ?? null,
      result: { status: 401, mode: body.mode, clientName: body.clientName },
    };
  }
  return { slug: null, result: response.status === 404 ? { status: 404 } : { status: 'error' } };
}

/** The OS public Brand Hub API (2F.2), the only data source of this static site (SEC-40). */
export function createSiteApi(
  osUrl: string,
  fetcher: typeof fetch = fetch,
  pagesUrl: string = osUrl,
): SiteApi {
  const base = osUrl.replace(/\/+$/, '');
  const pages = pagesUrl.replace(/\/+$/, '');
  const hubPath = (slug: string) => `${base}/api/public/hubs/${encodeURIComponent(slug)}`;

  return {
    async loadHub(slug, token) {
      const response = await fetcher(hubPath(slug), { headers: authorization(token) }).catch(
        () => null,
      );
      return (await readHub(response)).result;
    },
    async loadHubByDomain(host, token) {
      const response = await fetcher(`${base}/api/public/domains/${encodeURIComponent(host)}`, {
        headers: authorization(token),
      }).catch(() => null);
      return readHub(response);
    },
    async manual(slug, token) {
      const response = await fetcher(`${hubPath(slug)}/manual`, {
        headers: authorization(token),
      }).catch(() => null);
      if (!response) return { status: 'error' };
      if (response.status === 200) {
        const body = (await response.json()) as { url: string; fileName: string };
        return { status: 200, url: body.url, fileName: body.fileName };
      }
      return response.status === 401 || response.status === 404
        ? { status: response.status }
        : { status: 'error' };
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
      return `${pages}/pt-PT/hub-access/${encodeURIComponent(slug)}?return=${encodeURIComponent(returnTo)}`;
    },
  };
}
