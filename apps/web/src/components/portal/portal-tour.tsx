'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { cn } from '@agency-os/ui/lib/utils';

const START_EVENT = 'portal-tour:start';

type TourStepId =
  | 'welcome'
  | 'project'
  | 'actions'
  | 'approvals'
  | 'documents'
  | 'hub'
  | 'updates'
  | 'progress'
  | 'done';

/** Each step points at a home section or a navigation link; a null target centres the card. */
const STEPS: ReadonlyArray<{ id: TourStepId; target: string | null }> = [
  { id: 'welcome', target: null },
  { id: 'project', target: '[data-tour="project"]' },
  { id: 'actions', target: '[data-tour="actions"]' },
  { id: 'approvals', target: '[data-nav="/portal/approvals"]' },
  { id: 'documents', target: '[data-nav="/portal/docs"]' },
  { id: 'hub', target: '[data-nav="/portal/hub"]' },
  { id: 'updates', target: '[data-nav="/portal/updates"]' },
  { id: 'progress', target: '[data-nav="/portal/progress"]' },
  { id: 'done', target: null },
];

const CARD_WIDTH = 340;
const EDGE = 16;
const GAP = 14;
const SPOTLIGHT_PADDING = 6;

type Box = { top: number; left: number; width: number; height: number };

/** Starts the tour from anywhere on the page, such as the getting-started list. */
export function startPortalTour(): void {
  window.dispatchEvent(new Event(START_EVENT));
}

function visibleTarget(selector: string | null): Element | null {
  if (!selector) return null;
  const element = document.querySelector(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? element : null;
}

/** Beside the target when there is room (the sidebar), else below or above it, kept on screen. */
function cardPosition(target: Box | null, cardHeight: number): { top: number; left: number } {
  const width = Math.min(CARD_WIDTH, window.innerWidth - EDGE * 2);
  const clampLeft = (left: number) =>
    Math.min(Math.max(left, EDGE), window.innerWidth - width - EDGE);
  const clampTop = (top: number) =>
    Math.min(Math.max(top, EDGE), window.innerHeight - cardHeight - EDGE);
  if (!target) {
    return {
      top: clampTop((window.innerHeight - cardHeight) / 2),
      left: clampLeft((window.innerWidth - width) / 2),
    };
  }
  const right = target.left + target.width + GAP;
  if (right + width <= window.innerWidth - EDGE) {
    return { top: clampTop(target.top), left: right };
  }
  const below = target.top + target.height + GAP;
  if (below + cardHeight <= window.innerHeight - EDGE) {
    return { top: below, left: clampLeft(target.left) };
  }
  return { top: clampTop(target.top - GAP - cardHeight), left: clampLeft(target.left) };
}

/**
 * The portal's guided tour: a welcome, one stop per area the client uses and a closing note.
 * Stops whose target is not on screen (a collapsed sidebar, a section the client does not have)
 * are left out. It opens on the first visit, can be restarted at any time, and finishing or
 * skipping it calls `onFinish` once per run.
 */
export function PortalTour({
  autoStart,
  onFinish,
}: {
  autoStart: boolean;
  onFinish: () => Promise<void>;
}) {
  const t = useTranslations('portal.tour');
  const titleId = useId();
  const bodyId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const [steps, setSteps] = useState<typeof STEPS>([]);
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<Box | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const open = steps.length > 0;
  const step = steps[index];

  const start = useCallback(() => {
    returnFocus.current = document.activeElement;
    setSteps(STEPS.filter((entry) => entry.target === null || visibleTarget(entry.target)));
    setIndex(0);
  }, []);

  const finish = useCallback(() => {
    setSteps([]);
    setTarget(null);
    setPosition(null);
    void onFinish().catch(() => undefined);
    if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
  }, [onFinish]);

  useEffect(() => {
    window.addEventListener(START_EVENT, start);
    return () => window.removeEventListener(START_EVENT, start);
  }, [start]);

  useEffect(() => {
    if (autoStart) start();
  }, [autoStart, start]);

  const measure = useCallback(() => {
    if (!step) return;
    const element = visibleTarget(step.target);
    const rect = element?.getBoundingClientRect();
    const box = rect
      ? {
          top: rect.top - SPOTLIGHT_PADDING,
          left: rect.left - SPOTLIGHT_PADDING,
          width: rect.width + SPOTLIGHT_PADDING * 2,
          height: rect.height + SPOTLIGHT_PADDING * 2,
        }
      : null;
    setTarget(box);
    setPosition(cardPosition(box, cardRef.current?.offsetHeight ?? 220));
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return;
    const element = visibleTarget(step.target);
    if (element && !element.closest('[data-sidebar]')) {
      element.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
    measure();
    primaryRef.current?.focus();
  }, [step, measure]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, measure]);

  if (!open || !step) return null;
  const last = index === steps.length - 1;
  const next = () => (last ? finish() : setIndex(index + 1));

  return createPortal(
    <div className="fixed inset-0 z-[80]">
      {target ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-lg shadow-[0_0_0_9999px_rgb(0_0_0/0.62)] ring-2 ring-brand transition-[top,left,width,height] duration-200 ease-out motion-reduce:transition-none"
          style={target}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-black/62" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            const buttons = [...(cardRef.current?.querySelectorAll('button') ?? [])];
            const first = buttons[0];
            const lastButton = buttons.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              lastButton?.focus();
            } else if (!event.shiftKey && document.activeElement === lastButton) {
              event.preventDefault();
              first?.focus();
            }
          }
          if (event.key === 'Escape') finish();
          if (event.key === 'ArrowRight') next();
          if (event.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
        }}
        className={cn(
          'absolute flex w-[min(340px,calc(100vw-32px))] flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-xl',
          'transition-[top,left] duration-200 ease-out motion-reduce:transition-none',
          !position && 'invisible',
        )}
        style={position ?? { top: 0, left: 0 }}
      >
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-[11px] font-medium tracking-[0.12em] text-text-tertiary uppercase">
            {t('counter', { current: index + 1, total: steps.length })}
          </p>
          <h2 id={titleId} className="text-title-sm text-text">
            {t(`steps.${step.id}.title`)}
          </h2>
          <p id={bodyId} className="text-body-sm text-text-secondary">
            {t(`steps.${step.id}.body`)}
          </p>
        </div>
        <div aria-hidden="true" className="flex gap-1">
          {steps.map((entry, position) => (
            <span
              key={entry.id}
              className={cn(
                'h-1 flex-1 rounded-full',
                position <= index ? 'bg-brand' : 'bg-border',
              )}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          {last ? (
            <span />
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={finish}>
              {t('skip')}
            </Button>
          )}
          <div className="flex gap-2">
            {index > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setIndex(index - 1)}>
                {t('previous')}
              </Button>
            ) : null}
            <Button ref={primaryRef} type="button" size="sm" onClick={next}>
              {last ? t('finish') : t('next')}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
