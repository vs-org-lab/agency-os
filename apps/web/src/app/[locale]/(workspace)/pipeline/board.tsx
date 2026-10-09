'use client';

import { useState, useTransition } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { ArrowRightLeft, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { currencyFormatOptions } from '@agency-os/i18n';
import { Button } from '@agency-os/ui/components/button';
import { cn } from '@agency-os/ui/lib/utils';
import { FormMessage } from '@/components/forms/form-message';
import { Link } from '@/i18n/navigation';
import {
  ENABLED_STAGES,
  PIPELINE_STAGES,
  pipelineCodeMessageKey,
  type PipelineCard,
  type PipelineCode,
  type PipelineStage,
} from '@/modules/commercial';
import { MoveDialog, requiresReason } from './move-dialog';

export type MoveResult = { ok: true } | { ok: false; message: string };
export type MoveDeal = (input: {
  dealId: string;
  to: PipelineCode;
  reason: string | null;
}) => Promise<MoveResult>;

type PendingMove = { card: PipelineCard; target: PipelineCode | null };

function DealCard({ card, onMove }: { card: PipelineCard; onMove: (card: PipelineCard) => void }) {
  const t = useTranslations('commercial.board');
  const format = useFormatter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.dealId,
    data: { card },
  });

  return (
    <article
      ref={setNodeRef}
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
      className={cn(
        'flex flex-col gap-2 rounded-md border border-border bg-surface p-3 text-left',
        isDragging && 'z-10 shadow-lg',
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <button
          type="button"
          aria-label={t('drag', { name: card.clientName })}
          className="-ml-1 flex size-6 shrink-0 cursor-grab items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-muted active:cursor-grabbing"
          {...listeners}
          {...attributes}
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
        <Link
          href={`/pipeline/${card.dealId}`}
          className="min-w-0 flex-1 truncate text-body-sm font-medium text-text hover:underline"
        >
          {card.clientName}
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t('moveTo', { name: card.clientName })}
          onClick={() => onMove(card)}
        >
          <ArrowRightLeft aria-hidden />
        </Button>
      </div>
      {card.estimatedValue ? (
        <p className="text-caption text-text-secondary tabular-nums">
          {format.number(Number(card.estimatedValue), currencyFormatOptions(card.currency))}
        </p>
      ) : null}
      <p className="line-clamp-2 text-caption text-text">{card.nextStep ?? t('card.noNextStep')}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-tertiary">
        <span>
          {card.ownerKind === 'client' ? t('card.client') : (card.ownerLabel ?? t('card.noOwner'))}
        </span>
        {card.dueOn ? (
          <span className={cn(card.overdue && 'text-danger')}>
            {card.overdue
              ? t('card.overdue')
              : t('card.due', {
                  date: format.dateTime(new Date(card.dueOn), { day: 'numeric', month: 'short' }),
                })}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function Column({
  code,
  cards,
  onMove,
}: {
  code: PipelineCode;
  cards: PipelineCard[];
  onMove: (card: PipelineCard) => void;
}) {
  const t = useTranslations('commercial');
  const { setNodeRef, isOver } = useDroppable({ id: code });
  const name = t(`pipeline.codes.${pipelineCodeMessageKey(code)}` as never);
  const titleId = `column-${code.replace('.', '-')}`;

  return (
    <section
      ref={setNodeRef}
      aria-label={`${code} ${name}`}
      className={cn(
        'flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-surface-muted p-2',
        isOver && 'ring-2 ring-border-strong',
      )}
    >
      <header id={titleId} className="flex items-baseline justify-between gap-2 px-1">
        <h3 className="truncate text-label text-text">
          <span className="font-mono text-text-secondary">{code}</span> {name}
        </h3>
        <span className="text-caption text-text-secondary tabular-nums">{cards.length}</span>
      </header>
      {cards.length === 0 ? (
        <p className="px-1 py-4 text-caption text-text-secondary">{t('board.emptyColumn')}</p>
      ) : (
        cards.map((card) => <DealCard key={card.dealId} card={card} onMove={onMove} />)
      )}
    </section>
  );
}

export function Board({ cards: initialCards, move }: { cards: PipelineCard[]; move: MoveDeal }) {
  const t = useTranslations('commercial');
  const [cards, setCards] = useState(initialCards);
  const [message, setMessage] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [collapsed, setCollapsed] = useState<Set<PipelineStage>>(
    () =>
      new Set(
        PIPELINE_STAGES.map((entry) => entry.stage).filter((stage) => !ENABLED_STAGES.has(stage)),
      ),
  );
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const apply = (card: PipelineCard, to: PipelineCode, reason: string | null) => {
    setPending(null);
    setCards((current) =>
      current.map((entry) => (entry.dealId === card.dealId ? { ...entry, code: to } : entry)),
    );
    startTransition(async () => {
      const result = await move({ dealId: card.dealId, to, reason });
      if (result.ok) {
        setMessage({ tone: 'success', text: t('board.moved', { code: to }) });
        return;
      }
      setCards((current) =>
        current.map((entry) =>
          entry.dealId === card.dealId ? { ...entry, code: card.code } : entry,
        ),
      );
      setMessage({ tone: 'danger', text: result.message });
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const card = (event.active.data.current as { card?: PipelineCard } | undefined)?.card;
    const target = event.over?.id as PipelineCode | undefined;
    if (!card || !target || target === card.code) return;
    if (requiresReason(card.code, target)) {
      setPending({ card, target });
      return;
    }
    apply(card, target, null);
  };

  const toggle = (stage: PipelineStage) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });

  const byCode = (code: PipelineCode) => cards.filter((card) => card.code === code);

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-4">
        <div aria-live="polite">
          {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
        </div>
        {PIPELINE_STAGES.map((entry) => {
          const count = entry.codes.reduce((total, code) => total + byCode(code).length, 0);
          const isCollapsed = collapsed.has(entry.stage);
          return (
            <section key={entry.stage} className="flex flex-col gap-2">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() => toggle(entry.stage)}
                className="flex items-center gap-2 self-start rounded-md px-1 text-label text-text hover:bg-surface-muted"
              >
                {isCollapsed ? (
                  <ChevronRight aria-hidden className="size-4" />
                ) : (
                  <ChevronDown aria-hidden className="size-4" />
                )}
                {t(`pipeline.stages.${entry.stage}`)}
                <span className="text-caption text-text-tertiary">
                  {t('board.stageCount', { count })}
                </span>
              </button>
              {isCollapsed ? null : (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {entry.codes.map((code) => (
                    <Column
                      key={code}
                      code={code}
                      cards={byCode(code)}
                      onMove={(card) => setPending({ card, target: null })}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <MoveDialog
        open={pending !== null}
        from={pending?.card.code ?? '0.1'}
        initialTarget={pending?.target ?? null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onConfirm={(to, reason) => {
          if (pending) apply(pending.card, to, reason);
        }}
      />
    </DndContext>
  );
}
