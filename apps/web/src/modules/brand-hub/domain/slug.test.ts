import { describe, expect, it } from 'vitest';
import { isValidSlug, slugify } from './slug';

describe('brand hub slugs', () => {
  it('slugs are lower case ascii with single hyphens and at least three characters', () => {
    expect(slugify('Atlas Lda')).toBe('atlas-lda');
    expect(slugify('  Ótica  São João & Filhos!! ')).toBe('otica-sao-joao-filhos');
    expect(slugify('Bø')).toBe('b-hub');
    expect(slugify('***')).toBe('hub');
    expect(slugify('a'.repeat(80))).toHaveLength(54);
    expect(slugify('Empresa---Exemplo')).toBe('empresa-exemplo');
  });

  it('only well-formed slugs are valid', () => {
    expect(isValidSlug('atlas-lda')).toBe(true);
    expect(isValidSlug('Atlas')).toBe(false);
    expect(isValidSlug('ab')).toBe(false);
    expect(isValidSlug('a b c')).toBe(false);
    expect(isValidSlug('a'.repeat(61))).toBe(false);
  });
});
