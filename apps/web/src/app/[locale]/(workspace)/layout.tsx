import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { canSeePipeline } from '@/modules/commercial';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function WorkspaceLayout({ children, params }: LayoutProps) {
  const session = await requireArea('/', requireLocale((await params).locale));

  return (
    <AppShell
      session={session}
      level={{ level: 'studio', permissions: { pipeline: canSeePipeline(session.actor) } }}
    >
      {children}
    </AppShell>
  );
}
