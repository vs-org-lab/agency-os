'use client';

import { useCallback, useEffect, useRef, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { Label } from '@agency-os/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@agency-os/ui/components/select';
import { Tabs, TabsList, TabsTrigger } from '@agency-os/ui/components/tabs';
import { usePathname, useRouter } from '@/i18n/navigation';

export type FilterSegments = {
  param: string;
  options: { value: string; label: string; count?: number }[];
  value: string;
};

export type FilterSelect = {
  param: string;
  label: string;
  options: { value: string; label: string }[];
  value: string | null;
  allLabel: string;
};

const ALL = '__all__';

/**
 * Filters that apply on change. Every change is merged into one pending set of params, so a
 * second choice made while the previous navigation runs keeps the first and the last choice wins.
 */
export function FilterBar({
  segments,
  selects = [],
  controls,
}: {
  segments?: FilterSegments;
  selects?: FilterSelect[];
  /** Id of the region the segments filter; each trigger points at it. */
  controls?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const current = searchParams.toString();
  const pending = useRef(new URLSearchParams(current));
  const navigating = useRef(false);
  navigating.current = isPending;

  // Adopts the URL only when it changed from outside (links, back button), never mid-navigation.
  useEffect(() => {
    if (!navigating.current) pending.current = new URLSearchParams(current);
  }, [current]);

  const apply = useCallback(
    (param: string, value: string | null) => {
      const next = new URLSearchParams(pending.current);
      next.delete('new');
      if (value === null) next.delete(param);
      else next.set(param, value);
      pending.current = next;
      const query = next.toString();
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
    },
    [pathname, router],
  );

  return (
    <div data-slot="filter-bar" className="flex flex-wrap items-end gap-3">
      {segments ? (
        <Tabs
          value={segments.value}
          activationMode="manual"
          onValueChange={(value) => apply(segments.param, value)}
        >
          <TabsList>
            {segments.options.map((option) => (
              <TabsTrigger key={option.value} value={option.value} aria-controls={controls}>
                {option.label}
                {option.count !== undefined ? (
                  <span className="text-caption text-text-secondary tabular-nums">
                    {option.count}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}
      {selects.map((select) => {
        const id = `filter-${select.param}`;
        return (
          <div key={select.param} className="flex flex-col gap-1">
            <Label htmlFor={id}>{select.label}</Label>
            <Select
              value={select.value ?? ALL}
              onValueChange={(value) => apply(select.param, value === ALL ? null : value)}
            >
              <SelectTrigger id={id} className="min-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={ALL}>{select.allLabel}</SelectItem>
                {select.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}
