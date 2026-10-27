'use client';

import {
  Gauge,
  Wallet,
  BarChart3,
  ArrowLeft,
  CalendarDays,
  CircleCheck,
  FileText,
  FolderOpen,
  Images,
  ListChecks,
  Users,
  Home,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Newspaper,
  Palette,
  ReceiptText,
  Search,
  Settings,
  Target,
  TrendingUp,
} from 'lucide-react';
import { BrandSymbol, BrandWordmark } from '@agency-os/ui/brand';
import { ClientAvatar } from '@agency-os/ui/components/client-avatar';
import { LayoutGroup, m, transitions } from '@agency-os/ui/motion';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@agency-os/ui/components/sidebar';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { OPEN_COMMAND_PALETTE_EVENT } from '../command/command-palette';
import { AccountMenu } from './account-menu';
import { NAVIGATION_ICON_MOTION, type NavigationCounter, type NavigationIcon } from './navigation';
import { CounterValue, formatCounter, useLiveCounter } from './navigation-counter';

export type ResolvedNavigationItem = {
  href: string;
  label: string;
  icon: NavigationIcon;
  counter?: NavigationCounter;
};

export type CounterSource = { initial: number; refresh: () => Promise<number> };

export type AppSidebarProps = {
  workspaceName: string;
  roomName?: string;
  back: { href: string; label: string } | null;
  items: ResolvedNavigationItem[];
  footer: ResolvedNavigationItem[];
  clients?: { id: string; name: string }[];
  user: { name: string; email: string | null };
  counters?: Partial<Record<NavigationCounter, CounterSource>>;
  /** Present only where the command palette is mounted. */
  search?: { label: string };
  labels: {
    mobileTitle: string;
    mobileDescription: string;
    clients: string;
    noClients: string;
    account: string;
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
  receipt: ReceiptText,
  feed: Newspaper,
  check: CircleCheck,
  tasks: ListChecks,
  users: Users,
  proofs: Images,
  folder: FolderOpen,
  documents: FileText,
  brand: Palette,
  calendar: CalendarDays,
  wallet: Wallet,
  chart: BarChart3,
  trend: TrendingUp,
  gauge: Gauge,
} as const;

function NavigationItemLink({
  item,
  active,
  source,
}: {
  item: ResolvedNavigationItem;
  active: boolean;
  source: CounterSource | undefined;
}) {
  const t = useTranslations('shell');
  const locale = useLocale();
  const count = useLiveCounter(source?.initial ?? 0, source?.refresh ?? noCount);
  const display = source ? formatCounter(count) : null;
  const Icon = ICONS[item.icon];

  return (
    <SidebarMenuItem className="isolate">
      {active ? (
        <m.span
          data-slot="sidebar-active-indicator"
          layoutId="sidebar-active"
          aria-hidden="true"
          transition={transitions.morph}
          className="absolute inset-0 -z-10 rounded-md bg-sidebar-accent"
        />
      ) : null}
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={item.label}
        className="data-[active=true]:bg-transparent"
      >
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          aria-label={display ? t('unseenLabel', { label: item.label, count }) : undefined}
        >
          <Icon aria-hidden data-icon-motion={NAVIGATION_ICON_MOTION[item.icon]} />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {display ? (
        <>
          <SidebarMenuBadge aria-hidden className="rounded-full bg-info-bg text-info">
            <CounterValue count={count} locale={locale} />
          </SidebarMenuBadge>
          <span
            aria-hidden
            className="pointer-events-none absolute top-1 right-1 hidden size-2 rounded-full bg-info group-data-[collapsible=icon]:block"
          />
        </>
      ) : null}
    </SidebarMenuItem>
  );
}

async function noCount(): Promise<number> {
  return 0;
}

export function AppSidebar(props: AppSidebarProps) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/' || href === '/portal' ? pathname === href : pathname.startsWith(href);

  const renderItem = (item: ResolvedNavigationItem) => (
    <NavigationItemLink
      key={item.href}
      item={item}
      active={isActive(item.href)}
      source={item.counter ? props.counters?.[item.counter] : undefined}
    />
  );

  return (
    <LayoutGroup id="sidebar-menu">
      <Sidebar
        collapsible="icon"
        mobileTitle={props.labels.mobileTitle}
        mobileDescription={props.labels.mobileDescription}
      >
        <SidebarHeader className="px-3 pt-3">
          <div
            className="flex h-8 items-center gap-2 overflow-hidden px-1"
            title={props.workspaceName}
          >
            <BrandSymbol className="size-5 shrink-0 text-text" title={props.labels.brand} />
            <BrandWordmark className="h-3.5 w-auto shrink-0 text-text group-data-[collapsible=icon]:hidden" />
          </div>
        </SidebarHeader>

        <SidebarContent>
          {props.search ? (
            <SidebarGroup className="pb-0">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    tooltip={props.search.label}
                    aria-keyshortcuts="Control+K Meta+K"
                    onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))}
                  >
                    <Search aria-hidden />
                    <span>{props.search.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          ) : null}

          {props.back ? (
            <SidebarGroup className="pb-0">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={props.back.label}>
                    <Link href={props.back.href}>
                      <ArrowLeft aria-hidden data-icon-motion="back" />
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
                            <ClientAvatar id={client.id} name={client.name} size="sm" />
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
          <AccountMenu
            user={props.user}
            labels={{
              account: props.labels.account,
              theme: props.labels.theme,
              themeOptions: props.labels.themeOptions,
              locale: props.labels.locale,
              localeOptions: props.labels.localeOptions,
              signOut: props.labels.signOut,
            }}
          />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
    </LayoutGroup>
  );
}
