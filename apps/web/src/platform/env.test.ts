import { describe, expect, it } from 'vitest';
import { parseBrandHubSiteEnv, parsePaymentsEnv } from './env';

describe('parsePaymentsEnv', () => {
  it('defaults to manual payments', () => {
    expect(parsePaymentsEnv({})).toEqual({ PAYMENTS_PROVIDER: 'fake' });
  });

  it('accepts Stripe test keys only until launch', () => {
    expect(
      parsePaymentsEnv({
        PAYMENTS_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_test_123',
        STRIPE_WEBHOOK_SECRET: 'whsec_123',
      }),
    ).toMatchObject({ PAYMENTS_PROVIDER: 'stripe' });
    expect(() =>
      parsePaymentsEnv({
        PAYMENTS_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_live_123',
        STRIPE_WEBHOOK_SECRET: 'whsec_123',
      }),
    ).toThrow();
  });
});

describe('parseBrandHubSiteEnv', () => {
  it('turns the site off until its address, origins and secret are all set', () => {
    expect(parseBrandHubSiteEnv({})).toBeNull();
    expect(parseBrandHubSiteEnv({ BRAND_HUB_SITE_URL: 'https://hubs.example.com' })).toBeNull();
    expect(
      parseBrandHubSiteEnv({
        BRAND_HUB_SITE_URL: 'https://hubs.example.com/',
        BRAND_HUB_SITE_ORIGINS: 'https://hubs.example.com, http://localhost:3001',
        BRAND_HUB_TOKEN_SECRET: 'x'.repeat(32),
      }),
    ).toEqual({
      url: 'https://hubs.example.com',
      origins: ['https://hubs.example.com', 'http://localhost:3001'],
      tokenSecret: 'x'.repeat(32),
    });
    expect(() =>
      parseBrandHubSiteEnv({
        BRAND_HUB_SITE_URL: 'https://hubs.example.com',
        BRAND_HUB_SITE_ORIGINS: 'https://hubs.example.com',
        BRAND_HUB_TOKEN_SECRET: 'short',
      }),
    ).toThrow();
  });
});
