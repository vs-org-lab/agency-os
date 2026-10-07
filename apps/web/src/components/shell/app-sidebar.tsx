'use client';

import {
  ArrowLeft,
  Home,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Settings,
  Target,
} from 'lucide-react';
import { BrandSymbol } from '@agency-os/ui/brand';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@agency-os/ui/components/sidebar';
import { ThemeToggle } from '@agency-os/ui/theme-toggle';
import { Link, usePathname } from '@/i18n/navigation';
import { LocaleSwitcher } from './locale-switcher';
import type { NavigationIcon } from './navigation';
import { signOutAction } from './sign-out-action';

export type ResolvedNavigationItem = { href: string; label: string; icon: NavigationIcon };

export type AppSidebarProps = {
  workspaceName: string;
  roomName?: string;
  back: { href: string; label: string } | null;
  items: ResolvedNavigationItem[];
  footer: ResolvedNavigationItem[];
  clients?: { id: string; name: string }[];
  user: { name: string; email: string | null };
  labels: {
    mobileTitle: string;
    mobileDescription: string;
    clients: string;
    noClients: string;
    signOut: string;
    theme: string;
    themeOptions: { light: string; dark: string; system: string };
    locale: string;
    localeOptions: { 'pt-PT': string; en: string };
    brand: string;
  };
};

const ICONS = {
  home: Home,
  settings: Settings,
  dashboard: LayoutDashboard,
  kanban: KanbanSquare,
  inbox: Inbox,
  target: Target,
} as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function AppSidebar(props: AppSidebarProps) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/' || href === '/portal' ? pathname === href : pathname.startsWith(href);

  const renderItem = (item: ResolvedNavigationItem) => {
    const Icon = ICONS[item.icon];
    return (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.label}>
          <Link href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
            <Icon aria-hidden />
            <span>{item.label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar
      collapsible="icon"
      mobileTitle={props.labels.mobileTitle}
      mobileDescription={props.labels.mobileDescription}
    >
      <SidebarHeader className="gap-3 px-3 pt-3">
        <div className="flex items-center gap-2 overflow-hidden">
          <BrandSymbol className="size-5 shrink-0 text-text" title={props.labels.brand} />
          <span className="truncate text-label text-text group-data-[collapsible=icon]:hidden">
            {props.workspaceName}
          </span>
        </div>
        <ThemeToggle
          label={props.labels.theme}
          labels={props.labels.themeOptions}
          className="group-data-[collapsible=icon]:hidden"
        />
      </SidebarHeader>

      <SidebarContent>
        {props.back ? (
          <SidebarGroup className="pb-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={props.back.label}>
                  <Link href={props.back.href}>
                    <ArrowLeft aria-hidden />
                    <span>{props.back.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            {props.roomName ? (
              <p className="truncate px-2 pt-3 text-title-sm text-text group-data-[collapsible=icon]:hidden">
                {props.roomName}
              </p>
            ) : null}
          </SidebarGroup>
        ) : null}

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{props.items.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {props.clients ? (
          <SidebarGroup>
            <SidebarGroupLabel>{props.labels.clients}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {props.clients.length === 0 ? (
                  <p className="px-2 text-caption text-text-tertiary group-data-[collapsible=icon]:hidden">
                    {props.labels.noClients}
                  </p>
                ) : (
                  props.clients.map((client) => (
                    <SidebarMenuItem key={client.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname.startsWith(`/c/${client.id}`)}
                        tooltip={client.name}
                      >
                        <Link href={`/c/${client.id}`}>
                          <span
                            aria-hidden
                            className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-surface-muted text-caption font-semibold text-text-secondary"
                          >
                            {initials(client.name)}
                          </span>
                          <span>{client.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="gap-2 px-3 pb-3">
        <SidebarMenu>{props.footer.map(renderItem)}</SidebarMenu>
        <SidebarSeparator className="mx-0" />
        <div className="flex items-center gap-2 overflow-hidden">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-caption font-semibold text-text-secondary"
          >
            {initials(props.user.name)}
          </span>
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate text-body-sm font-medium text-text">{props.user.name}</span>
            {props.user.email ? (
              <span className="truncate text-caption text-text-tertiary">{props.user.email}</span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:hidden">
          <LocaleSwitcher label={props.labels.locale} labels={props.labels.localeOptions} />
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-body-sm text-text-secondary transition-colors duration-(--duration-fast) hover:bg-surface-muted hover:text-text"
            >
              <LogOut className="size-4" aria-hidden />
              {props.labels.signOut}
            </button>
          </form>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
