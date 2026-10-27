import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { SidebarInset, SidebarProvider } from '@agency-os/ui/components/sidebar';
import {
  findOrganizationName,
  findProfileName,
  findVisibleClient,
  listVisibleClients,
} from '@/modules/organizations';
import { withUserContext } from '@/platform/db';
import { CommandPalette, type CreateAction } from '../command/command-palette';
import { SkipLink } from './skip-link';
import { AppSidebar, type CounterSource } from './app-sidebar';
import { buildNavigation, type NavigationCounter, type NavigationLevel } from './navigation';
import type { AreaSession } from './session-guard';
import { TopBar } from './top-bar';

export async function AppShell({
  session,
  level,
  counters,
  commandPalette,
  children,
}: {
  session: AreaSession;
  level: NavigationLevel;
  counters?: Partial<Record<NavigationCounter, CounterSource>>;
  /** Mounts the command palette; only the internal workspace and rooms pass it. */
  commandPalette?: { createActions: CreateAction[] };
  children: ReactNode;
}) {
  const t = await getTranslations();
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false';

  const data = await withUserContext(session.claims, async (tx) => {
    const firstPortalClientId =
      level.level === 'portal' ? [...session.ctx.clientRoles.keys()][0] : undefined;
    const roomClientId = level.level === 'room' ? level.clientId : firstPortalClientId;
    return {
      organizationName: await findOrganizationName(tx, session.actor.organizationId),
      userName: await findProfileName(tx, session.actor.userId),
      clients: level.level === 'portal' ? undefined : await listVisibleClients(tx),
      room: roomClientId ? await findVisibleClient(tx, roomClientId) : null,
    };
  });

  const navigation = buildNavigation(level);
  const resolve = (items: typeof navigation.items) =>
    items.map((item) => ({ ...item, label: t(item.labelKey) }));
  const workspaceName =
    level.level === 'portal' && data.room
      ? data.room.name
      : (data.organizationName ?? t('app.name'));

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <SkipLink label={t('shell.skipToContent')} />
      <AppSidebar
        workspaceName={workspaceName}
        roomName={level.level === 'room' ? data.room?.name : undefined}
        back={
          navigation.back
            ? { href: navigation.back.href, label: t(navigation.back.labelKey) }
            : null
        }
        items={resolve(navigation.items)}
        footer={resolve(navigation.footer)}
        clients={level.level === 'studio' ? data.clients : undefined}
        counters={counters}
        search={commandPalette ? { label: t('command.open') } : undefined}
        user={{
          name: data.userName ?? session.claims.email ?? '',
          email: session.claims.email ?? null,
        }}
        labels={{
          mobileTitle: t('shell.navigation'),
          mobileDescription: t('shell.navigationDescription'),
          clients: t('shell.clients'),
          noClients: t('shell.noClients'),
          account: t('shell.account'),
          signOut: t('auth.signOut'),
          theme: t('shell.theme.label'),
          themeOptions: {
            light: t('shell.theme.light'),
            dark: t('shell.theme.dark'),
            system: t('shell.theme.system'),
          },
          locale: t('shell.locale.label'),
          localeOptions: { 'pt-PT': t('shell.locale.pt-PT'), en: t('shell.locale.en') },
          brand: t('app.name'),
        }}
      />
      <SidebarInset className="min-w-0 bg-canvas">
        <TopBar
          trail={[workspaceName, ...(level.level === 'room' && data.room ? [data.room.name] : [])]}
          toggleLabel={t('shell.toggleSidebar')}
          breadcrumbLabel={t('shell.breadcrumb')}
        />
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 md:px-6 xl:px-8">
          {children}
        </main>
      </SidebarInset>
      {commandPalette ? (
        <CommandPalette
          navigation={[...navigation.items, ...navigation.footer]}
          createActions={commandPalette.createActions}
        />
      ) : null}
    </SidebarProvider>
  );
}
