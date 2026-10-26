import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { BrandSymbol } from '@agency-os/ui/brand';
import { ThemeToggle } from '@agency-os/ui/theme-toggle';
import { LocaleSwitcher } from '@/components/shell/locale-switcher';
import { SkipLink } from '@/components/shell/skip-link';

export async function PublicFrame({ embed, children }: { embed: boolean; children: ReactNode }) {
  const t = await getTranslations();

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {embed ? null : <SkipLink label={t('shell.skipToContent')} />}
      {embed ? null : (
        <header className="flex items-center justify-between gap-4 px-4 py-4 md:px-8">
          <BrandSymbol className="size-8 text-text" title={t('app.name')} />
          <div className="flex items-center gap-3">
            <LocaleSwitcher
              label={t('shell.locale.label')}
              labels={{ 'pt-PT': t('shell.locale.pt-PT'), en: t('shell.locale.en') }}
            />
            <ThemeToggle
              label={t('shell.theme.label')}
              labels={{
                light: t('shell.theme.light'),
                dark: t('shell.theme.dark'),
                system: t('shell.theme.system'),
              }}
            />
          </div>
        </header>
      )}
      <main id="main" tabIndex={-1} className="flex flex-1 justify-center px-4 py-8 md:py-16">
        <div className="flex w-full max-w-[560px] flex-col gap-8">{children}</div>
      </main>
    </div>
  );
}
