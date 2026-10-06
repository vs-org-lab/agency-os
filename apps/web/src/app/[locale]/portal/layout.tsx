import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function PortalLayout({ children, params }: LayoutProps) {
  const session = await requireArea('/portal', requireLocale((await params).locale));

  return (
    <AppShell session={session} level={{ level: 'portal' }}>
      {children}
    </AppShell>
  );
}
