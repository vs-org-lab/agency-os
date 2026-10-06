import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Fraunces, Inter, Space_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ThemeProvider } from '@agency-os/ui/theme';
import { requireLocale } from '@/i18n/require-locale';
import { routing } from '@/i18n/routing';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
});
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' });

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Omit<LayoutProps, 'children'>): Promise<Metadata> {
  const locale = requireLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'app' });
  return { title: t('name') };
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${spaceMono.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
