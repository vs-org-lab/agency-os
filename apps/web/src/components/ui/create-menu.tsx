'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { LayoutGroup, m, transitions, useReducedMotion } from '@agency-os/ui/motion';
import { Link } from '@/i18n/navigation';

export type CreateMenuItem = { label: string; href: string; icon: ReactNode };

const ITEM =
  'flex items-center gap-2 rounded-md px-3 py-2 text-body-sm text-text outline-none hover:bg-surface-muted focus-visible:bg-surface-muted';

/**
 * The primary "+ Novo" button; opening it morphs the button into a menu of creation flows, each
 * a link to the screen that already owns the flow. With reduced motion the menu opens in place.
 */
export function CreateMenu({ label, items }: { label: string; items: CreateMenuItem[] }) {
  const menuId = useId();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);

  const itemNodes = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (open) {
      itemNodes()[0]?.focus();
      return;
    }
    if (restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  if (items.length === 0) return null;

  const close = (returnFocus: boolean) => {
    restoreFocus.current = returnFocus;
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const nodes = itemNodes();
    const current = nodes.indexOf(document.activeElement as HTMLElement);
    const focusAt = (index: number) => {
      event.preventDefault();
      nodes[(index + nodes.length) % nodes.length]?.focus();
    };
    if (event.key === 'ArrowDown') focusAt(current + 1);
    else if (event.key === 'ArrowUp') focusAt(current - 1);
    else if (event.key === 'Home') focusAt(0);
    else if (event.key === 'End') focusAt(nodes.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') close(false);
  };

  const layoutId = reduceMotion ? undefined : 'create-menu';

  return (
    <LayoutGroup>
      <div className="relative h-9 min-w-24">
        {open ? (
          <m.div
            ref={menuRef}
            layoutId={layoutId}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onKeyDown}
            transition={transitions.morph}
            style={{ borderRadius: 8 }}
            className="absolute top-0 right-0 z-30 flex min-w-56 flex-col gap-0.5 border border-border bg-surface p-1 shadow-lg"
          >
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                tabIndex={-1}
                className={ITEM}
                onClick={() => close(false)}
              >
                <span aria-hidden="true" className="text-text-secondary">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            ))}
          </m.div>
        ) : (
          <m.button
            ref={triggerRef}
            layoutId={layoutId}
            type="button"
            aria-haspopup="menu"
            aria-expanded={false}
            aria-controls={menuId}
            transition={transitions.morph}
            style={{ borderRadius: 8 }}
            className="inline-flex h-9 items-center justify-center gap-1.5 bg-primary px-4 text-body-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={() => setOpen(true)}
          >
            <Plus aria-hidden="true" className="size-4" />
            {label}
          </m.button>
        )}
      </div>
    </LayoutGroup>
  );
}
