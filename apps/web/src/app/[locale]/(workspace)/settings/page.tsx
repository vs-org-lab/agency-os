import { redirect } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { pageMetadata } from '@/i18n/page-title';

type PageProps = { params: Promise<{ locale: string }> };

export default async function SettingsIndexPage({ params }: PageProps) {
  return redirect({ href: '/settings/sessions', locale: requireLocale((await params).locale) });
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'shell.settings');
}
