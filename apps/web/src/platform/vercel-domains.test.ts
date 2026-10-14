import { describe, expect, it } from 'vitest';
import { createVercelDomains } from './vercel-domains';

const CONFIG = { projectId: 'prj_site', teamId: 'team_aurion', token: 'secret-token' };

function recorder(responses: Response[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const response = responses.shift();
    if (!response) throw new Error('unexpected request');
    return response;
  }) as typeof fetch;
  return { calls, fetcher };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const PROJECT_DOMAIN =
  'https://api.vercel.com/v9/projects/prj_site/domains/marca.cliente.com?teamId=team_aurion';

describe('createVercelDomains', () => {
  it('vercel requests carry the team, the token and the domain', async () => {
    const { calls, fetcher } = recorder([
      json(200, { name: 'marca.cliente.com', verified: true }),
      json(200, { name: 'marca.cliente.com', verified: true }),
      json(200, { misconfigured: false }),
      json(200, {}),
    ]);
    const vercel = createVercelDomains(CONFIG, fetcher);

    expect(await vercel.addDomain('marca.cliente.com')).toEqual({ ok: true });
    expect(await vercel.domainStatus('marca.cliente.com')).toEqual({
      configured: true,
      challenges: [],
    });
    await vercel.removeDomain('marca.cliente.com');

    expect(calls.map((call) => [call.init?.method ?? 'GET', call.url])).toEqual([
      ['POST', 'https://api.vercel.com/v10/projects/prj_site/domains?teamId=team_aurion'],
      ['GET', PROJECT_DOMAIN],
      ['GET', 'https://api.vercel.com/v6/domains/marca.cliente.com/config?teamId=team_aurion'],
      ['DELETE', PROJECT_DOMAIN],
    ]);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ name: 'marca.cliente.com' });
    for (const call of calls) {
      expect(new Headers(call.init?.headers).get('authorization')).toBe('Bearer secret-token');
    }
  });

  it('vercel errors become messages and a missing domain counts as removed', async () => {
    const { fetcher } = recorder([
      json(409, {
        error: { code: 'domain_taken', message: 'Domain is in use by another project' },
      }),
      json(404, { error: { code: 'not_found', message: 'Domain not found' } }),
      json(404, { error: { code: 'not_found', message: 'Domain not found' } }),
      json(500, { error: { message: 'boom' } }),
    ]);
    const vercel = createVercelDomains(CONFIG, fetcher);

    expect(await vercel.addDomain('marca.cliente.com')).toEqual({
      ok: false,
      message: 'Domain is in use by another project',
    });
    await expect(vercel.removeDomain('marca.cliente.com')).resolves.toBeUndefined();
    await expect(vercel.removeDomain('marca.cliente.com')).rejects.toThrow(/500/);
  });

  it('a domain already on the project counts as added', async () => {
    const { fetcher } = recorder([
      json(409, { error: { code: 'domain_already_in_use', message: 'Already added' } }),
      json(200, { name: 'marca.cliente.com', verified: true }),
    ]);
    const vercel = createVercelDomains(CONFIG, fetcher);
    expect(await vercel.addDomain('marca.cliente.com')).toEqual({ ok: true });
  });

  it('vercel verification challenges are returned until the domain is verified', async () => {
    const { fetcher } = recorder([
      json(200, {
        name: 'marca.cliente.com',
        verified: false,
        verification: [
          {
            type: 'TXT',
            domain: '_vercel.cliente.com',
            value: 'vc-domain-verify=marca.cliente.com,abc123',
            reason: 'pending_domain_verification',
          },
        ],
      }),
      json(200, { misconfigured: false }),
      json(200, { name: 'marca.cliente.com', verified: true }),
      json(200, { misconfigured: true }),
    ]);
    const vercel = createVercelDomains(CONFIG, fetcher);

    expect(await vercel.domainStatus('marca.cliente.com')).toEqual({
      configured: false,
      challenges: [
        {
          type: 'TXT',
          name: '_vercel.cliente.com',
          value: 'vc-domain-verify=marca.cliente.com,abc123',
        },
      ],
    });
    expect(await vercel.domainStatus('marca.cliente.com')).toEqual({
      configured: false,
      challenges: [],
    });
  });
});
