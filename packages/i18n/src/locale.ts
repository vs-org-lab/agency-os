export const locales = ['pt-PT', 'en'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'pt-PT';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

function matchLanguageTag(tag: string): Locale | null {
  const normalized = tag.trim().toLowerCase();
  if (normalized === '' || normalized === '*') return null;
  const language = normalized.split('-')[0];
  if (language === 'pt') return 'pt-PT';
  if (language === 'en') return 'en';
  return null;
}

function parseAcceptLanguage(header: string): string[] {
  return header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...parameters] = part.split(';');
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith('q='));
      const quality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;
      return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.tag !== '' && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((entry) => entry.tag);
}

export function resolveLocale(input: {
  profile?: string | null;
  organization?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(input.profile)) return input.profile;
  if (isLocale(input.organization)) return input.organization;
  if (input.acceptLanguage) {
    for (const tag of parseAcceptLanguage(input.acceptLanguage)) {
      const match = matchLanguageTag(tag);
      if (match) return match;
    }
  }
  return defaultLocale;
}
