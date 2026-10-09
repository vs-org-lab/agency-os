import { describe, expect, it } from 'vitest';
import { parsePaymentsEnv } from './env';

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
