import { describe, expect, it } from 'vitest';
import { createFakeDomainProvider, domainProviderFrom, FAKE_TXT } from './domain-provider';

describe('domain provider', () => {
  it('the fake provider verifies only verified.test names', async () => {
    const fake = createFakeDomainProvider();
    expect(await fake.txtRecords('_agency-os.marca.verified.test')).toEqual([[FAKE_TXT]]);
    expect(await fake.txtRecords('_agency-os.marca.cliente.com')).toBeNull();
    expect(await fake.addDomain('marca.cliente.com')).toEqual({ ok: true });
    expect(await fake.domainConfigured('marca.cliente.com')).toBe(true);
    await expect(fake.removeDomain('marca.cliente.com')).resolves.toBeUndefined();
  });

  it('the provider is null without configuration', () => {
    expect(domainProviderFrom({})).toBeNull();
    expect(
      domainProviderFrom({ BRAND_HUB_VERCEL_PROJECT_ID: 'prj', BRAND_HUB_VERCEL_TEAM_ID: 'team' }),
    ).toBeNull();
    expect(domainProviderFrom({ DOMAIN_PROVIDER: 'fake' })?.kind).toBe('fake');
    expect(
      domainProviderFrom({
        BRAND_HUB_VERCEL_PROJECT_ID: 'prj',
        BRAND_HUB_VERCEL_TEAM_ID: 'team',
        BRAND_HUB_VERCEL_TOKEN: 'token',
      })?.kind,
    ).toBe('vercel');
  });
});
