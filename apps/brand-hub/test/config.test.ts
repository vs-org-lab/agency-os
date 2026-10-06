import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

describe('brand hub configuration', () => {
  it('brand hub build produces static out directory without server functions', () => {
    expect(nextConfig.output).toBe('export');
    expect(nextConfig.images?.unoptimized).toBe(true);
    expect(nextConfig.trailingSlash).toBe(true);
  });
});
