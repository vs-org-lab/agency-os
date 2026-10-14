'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@agency-os/ui/lib/utils';
import { Link } from '@/i18n/navigation';
import { lisbonTime, type AgendaItem } from '@/modules/agenda';
import { itemColor } from './agenda-colors';

const CHIP =
  'flex w-full min-w-0 items-baseline gap-1.5 rounded-md border-l-4 bg-surface-muted px-2 py-1 text-left text-caption text-text hover:bg-border';

/** One calendar item: a meeting opens its dialog, anything else opens where it lives. */
export function ItemChip({
  item,
  onItem,
  className,
}: {
  item: AgendaItem;
  onItem: (item: AgendaItem) => void;
  className?: string;
}) {
  const t = useTranslations('agenda');
  const time = item.startsAt ? lisbonTime(new Date(item.startsAt)) : null;
  const label = item.kind === 'meeting' ? item.title : `${t(`kinds.${item.kind}`)} · ${item.title}`;
  const content = (
    <>
      {time ? <span className="shrink-0 tabular-nums text-text-secondary">{time}</span> : null}
      <span className="truncate">{label}</span>
    </>
  );
  const style = { borderLeftColor: itemColor(item) };

  if (item.kind === 'meeting' || !item.href) {
    return (
      <button
        type="button"
        className={cn(CHIP, className)}
        style={style}
        onClick={() => onItem(item)}
      >
        {content}
      </button>
    );
  }
  return (
    <Link href={item.href} className={cn(CHIP, className)} style={style}>
      {content}
    </Link>
  );
}
