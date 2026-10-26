import type { ReactNode } from 'react';
import { Toaster } from '@agency-os/ui/components/sonner';
import { AppShell } from '@/components/shell/app-shell';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { canReadBilling } from '@/modules/billing';
import { canSeePipeline } from '@/modules/commercial';
import { commercialSession, loadUnseenApplicationsCount } from '@/modules/commercial/server';
import { unseenApplicationsAction } from './applications/actions';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function WorkspaceLayout({ children, params }: LayoutProps) {
  const session = await requireArea('/', requireLocale((await params).locale));
  const commercial = await commercialSession(session.claims);
  const unseenApplications = commercial ? await loadUnseenApplicationsCount(commercial) : 0;

  return (
    <AppShell
      session={session}
      level={{
        level: 'studio',
        permissions: {
          pipeline: canSeePipeline(session.actor),
          money: canReadBilling(session.actor),
          reports: session.actor.mfaVerifiedAt !== null && session.actor.roles.includes('founder'),
        },
      }}
      counters={
        commercial
          ? {
              unseenApplications: {
                initial: unseenApplications,
                refresh: unseenApplicationsAction,
              },
            }
          : undefined
      }
    >
      {children}
      <Toaster />
    </AppShell>
  );
}
