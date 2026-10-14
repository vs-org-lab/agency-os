const API = 'https://api.vercel.com';

export type VercelDomainsConfig = { projectId: string; teamId: string; token: string };

/** A DNS record Vercel asks for before it serves a domain another account already holds. */
export type DomainChallenge = { type: string; name: string; value: string };

export type DomainStatus = {
  /** Vercel serves the domain: its own verification passed and the DNS points to the site. */
  configured: boolean;
  challenges: DomainChallenge[];
};

export type VercelDomains = {
  addDomain(host: string): Promise<{ ok: true } | { ok: false; message: string }>;
  removeDomain(host: string): Promise<void>;
  domainStatus(host: string): Promise<DomainStatus>;
};

type ProjectDomain = {
  verified?: boolean;
  verification?: { type: string; domain: string; value: string }[];
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
  const projectDomainUrl = (host: string) =>
    `${API}/v9/projects/${project}/domains/${encodeURIComponent(host)}?${team}`;

  const projectDomain = async (host: string): Promise<ProjectDomain | null> => {
    const response = await fetcher(projectDomainUrl(host), { headers });
    return response.ok ? ((await response.json()) as ProjectDomain) : null;
  };

  return {
    async addDomain(host) {
      const response = await fetcher(`${API}/v10/projects/${project}/domains?${team}`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ name: host }),
      });
      if (response.ok) return { ok: true };
      const message = await errorMessage(response);
      // A domain left on the project by an earlier attempt is already where it should be.
      return (await projectDomain(host)) ? { ok: true } : { ok: false, message };
    },

    async removeDomain(host) {
      const response = await fetcher(projectDomainUrl(host), { method: 'DELETE', headers });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Vercel domain removal failed with ${response.status}`);
      }
    },

    async domainStatus(host) {
      const domain = await projectDomain(host);
      const config = await fetcher(`${API}/v6/domains/${encodeURIComponent(host)}/config?${team}`, {
        headers,
      });
      const misconfigured = config.ok
        ? ((await config.json()) as { misconfigured?: boolean }).misconfigured !== false
        : true;
      const verified = domain?.verified === true;
      return {
        configured: verified && !misconfigured,
        challenges: verified
          ? []
          : (domain?.verification ?? []).map((record) => ({
              type: record.type,
              name: record.domain,
              value: record.value,
            })),
      };
    },
  };
}
