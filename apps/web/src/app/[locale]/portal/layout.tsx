import type { ReactNode } from 'react';
import { Toaster } from '@agency-os/ui/components/sonner';
import { AppShell } from '@/components/shell/app-shell';
import { PreviewBanner } from '@/components/shell/preview-banner';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { findVisibleClient } from '@/modules/organizations';
import { withUserContext } from '@/platform/db';

type LayoutProps = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function PortalLayout({ children, params }: LayoutProps) {
  const session = await requireArea('/portal', requireLocale((await params).locale));
  const roles = [...session.ctx.clientRoles.values()][0] ?? [];
  const invoices = roles.some((role) => role === 'decision_maker' || role === 'client_finance');
  const room = roles.some((role) => role === 'decision_maker' || role === 'operational');
  const team = roles.includes('decision_maker');
  const preview = session.preview;
  const previewClient = preview
    ? await withUserContext(session.claims, (tx) => findVisibleClient(tx, preview.clientId))
    : null;

  return (
    <AppShell
      session={session}
      level={{ level: 'portal', permissions: { invoices, room, team } }}
      banner={
        preview && previewClient ? (
          <PreviewBanner
            clientId={preview.clientId}
            clientName={previewClient.name}
            role={preview.role}
          />
        ) : null
      }
    >
      {children}
      <Toaster />
    </AppShell>
  );
}
