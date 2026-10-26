import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getRequestConfig: (config: unknown) => config,
}));

describe('request config', () => {
  it('renders times in the studio time zone whatever the server zone is', async () => {
    const { default: config } = (await import('./request')) as unknown as {
      default: (input: { requestLocale: Promise<string> }) => Promise<{
        locale: string;
        timeZone: string;
      }>;
    };

    const resolved = await config({ requestLocale: Promise.resolve('pt-PT') });

    expect(resolved.locale).toBe('pt-PT');
    expect(resolved.timeZone).toBe('Europe/Lisbon');
  });
});
