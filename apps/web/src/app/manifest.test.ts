import { describe, expect, it } from 'vitest';
import manifest from './manifest';

describe('web app manifest', () => {
  it('manifest has name, standalone display, 192 and 512 icons and maskable icon', () => {
    const result = manifest();

    expect(result.name).toBe('Agency OS');
    expect(result.short_name).toBe('Agency OS');
    expect(result.display).toBe('standalone');
    expect(result.start_url).toBe('/');
    expect(result.theme_color).toBe('#0A0F15');
    expect(result.background_color).toBe('#0A0F15');

    const icons = result.icons ?? [];
    expect(icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: '/icons/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
        }),
        expect.objectContaining({
          src: '/icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
        }),
        expect.objectContaining({
          src: '/icons/maskable-512.png',
          sizes: '512x512',
          purpose: 'maskable',
        }),
      ]),
    );
  });
});
