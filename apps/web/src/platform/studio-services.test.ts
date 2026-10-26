import { describe, expect, it } from 'vitest';
import { studioServices } from './studio-services';

const byKey = (source: Record<string, string | undefined>) =>
  Object.fromEntries(studioServices(source).map((service) => [service.key, service.status]));

describe('studio services', () => {
  it('reports every service as missing or test mode for an empty environment', () => {
    expect(byKey({})).toEqual({
      payments: 'test',
      email: 'missing',
      transcription: 'test',
      receipts: 'missing',
      domains: 'missing',
      events: 'missing',
    });
  });

  it('reports test mode for fake and capture providers', () => {
    expect(
      byKey({
        PAYMENTS_PROVIDER: 'fake',
        EMAIL_TRANSPORT: 'capture',
        TRANSCRIPTION_PROVIDER: 'fake',
        RECEIPT_READER: 'fake',
        DOMAIN_PROVIDER: 'fake',
        INNGEST_DEV: '1',
      }),
    ).toEqual({
      payments: 'test',
      email: 'test',
      transcription: 'test',
      receipts: 'test',
      domains: 'test',
      events: 'test',
    });
  });

  it('reports active when real providers are fully configured', () => {
    expect(
      byKey({
        PAYMENTS_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_test_abc',
        STRIPE_WEBHOOK_SECRET: 'whsec_abc',
        EMAIL_TRANSPORT: 'smtp',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_USER: 'user',
        SMTP_PASSWORD: 'pass',
        TRANSCRIPTION_PROVIDER: 'groq',
        GROQ_API_KEY: 'gsk_x',
        RECEIPT_READER: 'groq',
        BRAND_HUB_VERCEL_PROJECT_ID: 'p',
        BRAND_HUB_VERCEL_TEAM_ID: 't',
        BRAND_HUB_VERCEL_TOKEN: 'tok',
        INNGEST_EVENT_KEY: 'ek',
        INNGEST_SIGNING_KEY: 'sk',
      }),
    ).toEqual({
      payments: 'active',
      email: 'active',
      transcription: 'active',
      receipts: 'active',
      domains: 'active',
      events: 'active',
    });
  });

  it('reports missing when a real provider lacks its credentials', () => {
    const status = byKey({
      PAYMENTS_PROVIDER: 'stripe',
      EMAIL_TRANSPORT: 'smtp',
      TRANSCRIPTION_PROVIDER: 'groq',
      RECEIPT_READER: 'groq',
      INNGEST_EVENT_KEY: 'ek',
    });
    expect(status).toMatchObject({
      payments: 'missing',
      email: 'missing',
      transcription: 'missing',
      receipts: 'missing',
      events: 'missing',
    });
  });

  it('returns only keys and statuses, never configuration values', () => {
    const result = studioServices({
      PAYMENTS_PROVIDER: 'stripe',
      STRIPE_SECRET_KEY: 'sk_test_supersecret',
      STRIPE_WEBHOOK_SECRET: 'whsec_supersecret',
    });
    expect(JSON.stringify(result)).not.toContain('supersecret');
    for (const service of result) expect(Object.keys(service).sort()).toEqual(['key', 'status']);
  });
});
