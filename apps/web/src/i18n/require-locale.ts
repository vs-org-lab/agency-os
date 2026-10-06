import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import type { Locale } from '@agency-os/i18n';
import { routing } from './routing';

export function requireLocale(value: string): Locale {
  if (!hasLocale(routing.locales, value)) notFound();
  return value;
}
