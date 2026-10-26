import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type messages from '@agency-os/i18n/messages/pt-PT';
import { requireLocale } from './require-locale';

type Leaves<T> = T extends string
  ? never
  : { [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}` }[keyof T & string];

export type PageTitleKey = Leaves<typeof messages>;

/**
 * Per-page document title: the layout's template appends the product name, so the page only
 * contributes the same message its visible heading uses.
 */
export async function pageMetadata(
  params: Promise<{ locale: string }>,
  key: PageTitleKey,
): Promise<Metadata> {
  const locale = requireLocale((await params).locale);
  const t = await getTranslations({ locale });
  return { title: (t as (path: string) => string)(key) };
}
