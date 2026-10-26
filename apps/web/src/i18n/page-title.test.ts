import { describe, expect, it, vi } from 'vitest';
import { pageMetadata } from './page-title';

const getTranslations = vi.fn();
vi.mock('next-intl/server', () => ({
  getTranslations: (options: unknown) => getTranslations(options),
}));

describe('page metadata', () => {
  it('builds the title from the message key in the requested locale', async () => {
    getTranslations.mockResolvedValue((key: string) => `translated:${key}`);

    const metadata = await pageMetadata(Promise.resolve({ locale: 'en' }), 'tasks.title');

    expect(getTranslations).toHaveBeenCalledWith({ locale: 'en' });
    expect(metadata).toEqual({ title: 'translated:tasks.title' });
  });

  it('rejects an unknown locale', async () => {
    await expect(pageMetadata(Promise.resolve({ locale: 'xx' }), 'tasks.title')).rejects.toThrow();
  });
});
