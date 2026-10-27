'use client';

import { ChevronsUpDown, LogOut } from 'lucide-react';
import type { Locale } from '@agency-os/i18n';
import { Popover, PopoverContent, PopoverTrigger } from '@agency-os/ui/components/popover';
import { ThemeToggle } from '@agency-os/ui/theme-toggle';
import { LocaleSwitcher } from './locale-switcher';
import { signOutAction } from './sign-out-action';

export type AccountMenuLabels = {
  account: string;
  theme: string;
  themeOptions: { light: string; dark: string; system: string };
  locale: string;
  localeOptions: Record<Locale, string>;
  signOut: string;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** The person at the foot of the sidebar; opens theme, language and sign out. */
export function AccountMenu({
  user,
  labels,
}: {
  user: { name: string; email?: string | null };
  labels: AccountMenuLabels;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 overflow-hidden rounded-md p-1.5 text-left transition-colors duration-(--duration-fast) hover:bg-surface-muted data-[state=open]:bg-surface-muted"
        >
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-muted text-caption font-semibold text-text"
          >
            {initials(user.name)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate text-body-sm font-medium text-text">{user.name}</span>
            {user.email ? (
              <span className="truncate text-caption text-text-tertiary">{user.email}</span>
            ) : null}
          </span>
          <ChevronsUpDown
            aria-hidden
            className="size-4 shrink-0 text-text-tertiary group-data-[collapsible=icon]:hidden"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        aria-label={labels.account}
        className="flex w-(--radix-popover-trigger-width) min-w-60 flex-col gap-3 rounded-lg border-border-strong bg-surface-muted p-2 shadow-lg"
      >
        <div className="flex flex-col gap-1.5 px-1 pt-1">
          <span className="text-caption font-medium text-text-tertiary">{labels.theme}</span>
          <ThemeToggle label={labels.theme} labels={labels.themeOptions} />
        </div>
        <div className="flex flex-col gap-1.5 px-1">
          <span className="text-caption font-medium text-text-tertiary">{labels.locale}</span>
          <LocaleSwitcher label={labels.locale} labels={labels.localeOptions} />
        </div>
        <div className="h-px bg-border" />
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-body-sm text-text-secondary transition-colors duration-(--duration-fast) hover:bg-surface hover:text-text"
          >
            <LogOut className="size-4" aria-hidden />
            {labels.signOut}
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
