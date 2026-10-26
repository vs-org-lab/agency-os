'use client';

import * as React from 'react';
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { cn } from '@agency-os/ui/lib/utils';
import { ClientAvatar } from './client-avatar';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

type Member = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  /** Members shown first, for example the ones with access to the room. */
  priority?: boolean;
};

type MemberSelectorProps = {
  members: readonly Member[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Accessible name of the trigger. */
  label: string;
  unassignedLabel: string;
  searchPlaceholder: string;
  /** Adds a hidden input so a form submits the chosen id (empty when unassigned). */
  name?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
};

const normalise = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function Avatar({ member }: { member: Member }) {
  return member.avatarUrl ? (
    <img src={member.avatarUrl} alt="" className="size-6 shrink-0 rounded-full object-cover" />
  ) : (
    <ClientAvatar id={member.id} name={member.name} size="sm" tone="neutral" />
  );
}

/** A combobox to pick one member by name, with their avatar and an option to clear the choice. */
function MemberSelector({
  members,
  value,
  onChange,
  label,
  unassignedLabel,
  searchPlaceholder,
  name,
  id,
  disabled,
  className,
}: MemberSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const selected = members.find((member) => member.id === value) ?? null;

  const ordered = React.useMemo(
    () => [...members.filter((member) => member.priority), ...members.filter((m) => !m.priority)],
    [members],
  );
  const query = normalise(search.trim());
  const visible = query
    ? ordered.filter((member) => normalise(member.name).includes(query))
    : ordered;
  const showUnassigned = query === '' || normalise(unassignedLabel).includes(query);

  const choose = (next: string | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch('');
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            disabled={disabled}
            className={cn(
              'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-body-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
              className,
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              {selected ? <Avatar member={selected} /> : null}
              <span className={cn('truncate', selected ? undefined : 'text-text-secondary')}>
                {selected ? selected.name : unassignedLabel}
              </span>
            </span>
            <ChevronsUpDownIcon aria-hidden className="size-4 shrink-0 text-text-tertiary" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
          <Command shouldFilter={false}>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
            <CommandList>
              <CommandEmpty>{unassignedLabel}</CommandEmpty>
              <CommandGroup>
                {showUnassigned ? (
                  <CommandItem value="__unassigned__" onSelect={() => choose(null)}>
                    <span className="flex-1 text-text-secondary">{unassignedLabel}</span>
                    {value === null ? <CheckIcon aria-hidden /> : null}
                  </CommandItem>
                ) : null}
                {visible.map((member) => (
                  <CommandItem key={member.id} value={member.id} onSelect={() => choose(member.id)}>
                    <Avatar member={member} />
                    <span data-slot="member-name" className="flex-1 truncate">
                      {member.name}
                    </span>
                    {member.id === value ? <CheckIcon aria-hidden /> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {name ? <input type="hidden" name={name} value={value ?? ''} disabled={disabled} /> : null}
    </>
  );
}

export { MemberSelector };
export type { Member, MemberSelectorProps };
