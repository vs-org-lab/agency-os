import { describe, expect, it } from 'vitest';
import { defaultLocale, resolveLocale } from '../src/locale';

describe('resolveLocale', () => {
  it('resolveLocale prefers profile, then organization, then accept-language, then pt-PT', () => {
    expect(resolveLocale({ profile: 'en', organization: 'pt-PT', acceptLanguage: 'pt-PT' })).toBe(
      'en',
    );
    expect(resolveLocale({ profile: null, organization: 'en', acceptLanguage: 'pt-PT' })).toBe(
      'en',
    );
    expect(resolveLocale({ acceptLanguage: 'en-GB,en;q=0.9,pt;q=0.8' })).toBe('en');
    expect(resolveLocale({})).toBe('pt-PT');
    expect(defaultLocale).toBe('pt-PT');
  });

  it('resolveLocale ignores unsupported values', () => {
    expect(resolveLocale({ profile: 'fr', organization: 'de', acceptLanguage: 'es-ES' })).toBe(
      'pt-PT',
    );
    expect(resolveLocale({ profile: 'fr', acceptLanguage: 'fr-FR,en;q=0.5' })).toBe('en');
  });

  it('resolveLocale maps regional Portuguese variants from the browser to pt-PT', () => {
    expect(resolveLocale({ acceptLanguage: 'pt-BR,pt;q=0.9' })).toBe('pt-PT');
  });

  it('resolveLocale respects accept-language quality order', () => {
    expect(resolveLocale({ acceptLanguage: 'pt;q=0.4,en;q=0.9' })).toBe('en');
  });
});
