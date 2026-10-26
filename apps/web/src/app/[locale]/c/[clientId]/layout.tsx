import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Toaster } from '@agency-os/ui/components/sonner';
import { AppShell } from '@/components/shell/app-shell';
import { commandCreateActions } from '@/components/command/create-actions';
import { roomAccess } from '@/components/shell/routing';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { findVisibleClient } from '@/modules/organizations';
import { hasOutcome } from '@/modules/outcomes/server';
import { hasRetainer } from '@/modules/retainers/server';
import { withUserContext } from '@/platform/db';

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string; clientId: string }>;
};

export default async function RoomLayout({ children, params }: LayoutProps) {
  const { locale, clientId } = await params;
  const session = await requireArea('/', requireLocale(locale));
  if (!z.uuid().safeParse(clientId).success) notFound();

  const client = await withUserContext(session.claims, (tx) => findVisibleClient(tx, clientId));
  if (roomAccess(session.actor, clientId, session.ctx, { exists: client !== null }) !== 'allowed') {
    notFound();
  }

  const writesRooms = session.actor.roles.some(
    (role) => role === 'founder' || role === 'project_manager',
  );
  const [retainer, outcome] = writesRooms
    ? [true, true]
    : await Promise.all([
        hasRetainer(session.claims, clientId),
        hasOutcome(session.claims, clientId),
      ]);

  return (
    <AppShell
      session={session}
      level={{ level: 'room', clientId, retainer, outcome }}
      commandPalette={{ createActions: commandCreateActions(session.actor) }}
    >
      {children}
      <Toaster />
    </AppShell>
  );
}
