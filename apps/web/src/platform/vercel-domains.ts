const API = 'https://api.vercel.com';

export type VercelDomainsConfig = { projectId: string; teamId: string; token: string };

export type VercelDomains = {
  addDomain(host: string): Promise<{ ok: true } | { ok: false; message: string }>;
  removeDomain(host: string): Promise<void>;
  domainConfigured(host: string): Promise<boolean>;
};

async function errorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? `Vercel answered ${response.status}`;
}

/** The domains of the Brand Hub site project, through the Vercel REST API. */
export function createVercelDomains(
  config: VercelDomainsConfig,
  fetcher: typeof fetch = fetch,
): VercelDomains {
  const team = `teamId=${encodeURIComponent(config.teamId)}`;
  const project = encodeURIComponent(config.projectId);
  const headers = { authorization: `Bearer ${config.token}` };

  return {
    async addDomain(host) {
      const response = await fetcher(`${API}/v10/projects/${project}/domains?${team}`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ name: host }),
      });
      return response.ok ? { ok: true } : { ok: false, message: await errorMessage(response) };
    },

    async removeDomain(host) {
      const response = await fetcher(
        `${API}/v9/projects/${project}/domains/${encodeURIComponent(host)}?${team}`,
        { method: 'DELETE', headers },
      );
      if (!response.ok && response.status !== 404) {
        throw new Error(`Vercel domain removal failed with ${response.status}`);
      }
    },

    async domainConfigured(host) {
      const response = await fetcher(
        `${API}/v6/domains/${encodeURIComponent(host)}/config?${team}`,
        { headers },
      );
      if (!response.ok) return false;
      const body = (await response.json()) as { misconfigured?: boolean };
      return body.misconfigured === false;
    },
  };
}
