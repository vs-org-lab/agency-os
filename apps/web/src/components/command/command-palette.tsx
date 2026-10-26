'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@agency-os/ui/components/command';
import { useRouter } from '@/i18n/navigation';
import type { NavigationItem } from '../shell/navigation';
import { searchWorkspaceAction } from './actions';
import type { CommandResult } from './search';

export const OPEN_COMMAND_PALETTE_EVENT = 'command-palette:open';

const DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;

export type CreateAction = { labelKey: 'command.create.newTask'; href: string };

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'done'; results: CommandResult[] };

export function CommandPalette({
  navigation,
  createActions,
}: {
  navigation: NavigationItem[];
  createActions: CreateAction[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });
  const latestRequest = useRef(0);
  const opener = useRef<HTMLElement | null>(null);
  const openRef = useRef(false);

  const onOpenChange = useCallback((next: boolean) => {
    if (next && document.activeElement instanceof HTMLElement) {
      opener.current = document.activeElement;
    }
    openRef.current = next;
    setOpen(next);
    if (!next) {
      latestRequest.current += 1;
      setQuery('');
      setSearch({ status: 'idle' });
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!openRef.current);
      }
    };
    const onOpen = () => onOpenChange(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    };
  }, [onOpenChange]);

  useEffect(() => {
    const request = ++latestRequest.current;
    const term = query.trim();
    if (term.length < MIN_QUERY_LENGTH) {
      setSearch({ status: 'idle' });
      return;
    }
    setSearch({ status: 'loading' });
    const timer = setTimeout(() => {
      searchWorkspaceAction(term)
        .then((outcome) => {
          if (request !== latestRequest.current) return;
          setSearch(
            outcome.ok ? { status: 'done', results: outcome.results } : { status: 'error' },
          );
        })
        .catch(() => {
          if (request === latestRequest.current) setSearch({ status: 'error' });
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const needle = query.trim().toLocaleLowerCase();
  const matches = (label: string) => needle === '' || label.toLocaleLowerCase().includes(needle);
  const destinations = navigation
    .map((item) => ({ href: item.href, label: t(item.labelKey) }))
    .filter((item) => matches(item.label));
  const creations = createActions
    .map((action) => ({ href: action.href, label: t(action.labelKey) }))
    .filter((action) => matches(action.label));
  const results = search.status === 'done' ? search.results : [];
  const hasAnything = destinations.length + creations.length + results.length > 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        opener.current?.focus();
      }}
      title={t('command.title')}
      description={t('command.description')}
      closeLabel={t('interaction.close')}
      commandProps={{ shouldFilter: false, loop: true }}
    >
      <CommandInput value={query} onValueChange={setQuery} placeholder={t('command.placeholder')} />
      <CommandList>
        {destinations.length > 0 ? (
          <CommandGroup heading={t('command.groups.goTo')}>
            {destinations.map((item) => (
              <CommandItem
                key={item.href}
                value={`goto:${item.href}`}
                onSelect={() => go(item.href)}
              >
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {creations.length > 0 ? (
          <CommandGroup heading={t('command.groups.create')}>
            {creations.map((action) => (
              <CommandItem
                key={action.href}
                value={`create:${action.href}`}
                onSelect={() => go(action.href)}
              >
                {action.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {results.length > 0 ? (
          <CommandGroup heading={t('command.groups.search')}>
            {results.map((result) => (
              <CommandItem
                key={`${result.kind}:${result.id}`}
                value={`${result.kind}:${result.id}`}
                onSelect={() => go(result.href)}
              >
                <span className="truncate">{result.title}</span>
                <span className="ml-auto flex shrink-0 items-center gap-2 text-caption text-text-tertiary">
                  {result.context ? <span className="truncate">{result.context}</span> : null}
                  <span>{t(`command.kind.${result.kind}`)}</span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {search.status === 'loading' ? (
          <p role="status" className="py-4 text-center text-body-sm text-text-secondary">
            {t('command.searching')}
          </p>
        ) : null}
        {search.status === 'error' ? (
          <p role="alert" className="py-4 text-center text-body-sm text-text-secondary">
            {t('command.error')}
          </p>
        ) : null}
        {search.status === 'done' && !hasAnything ? (
          <CommandEmpty>{t('command.empty')}</CommandEmpty>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
