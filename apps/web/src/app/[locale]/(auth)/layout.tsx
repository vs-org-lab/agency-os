import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { BrandSymbol } from '@agency-os/ui/brand';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('app');

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="flex w-full max-w-[400px] flex-col items-center gap-8">
        <BrandSymbol className="size-10 text-text" title={t('name')} />
        {children}
      </div>
    </main>
  );
}
