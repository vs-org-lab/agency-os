import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-next-path';

describe('safeNextPath', () => {
  it('keeps relative application paths', () => {
    expect(safeNextPath('/settings/sessions')).toBe('/settings/sessions');
  });

  it('rejects external and protocol-relative destinations', () => {
    for (const value of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'evil',
      '/a\r\nb',
    ]) {
      expect(safeNextPath(value), value).toBe('/');
    }
  });

  it('falls back to the root for missing values', () => {
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
  });
});
