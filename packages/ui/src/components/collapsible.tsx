'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { Collapsible as CollapsiblePrimitive } from 'radix-ui';
import { cn } from '@agency-os/ui/lib/utils';
import { m, transitions, useReducedMotion } from '@agency-os/ui/motion';

const CollapsibleOpenContext = React.createContext(false);

function Collapsible({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const open = openProp ?? internalOpen;

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  return (
    <CollapsibleOpenContext.Provider value={open}>
      <CollapsiblePrimitive.Root
        data-slot="collapsible"
        open={open}
        onOpenChange={handleOpenChange}
        {...props}
      />
    </CollapsibleOpenContext.Provider>
  );
}

function CollapsibleTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Trigger>) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn(
        'group/collapsible-trigger inline-flex items-center gap-1.5 rounded-md text-body-sm font-medium text-text outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    >
      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 text-text-secondary transition-transform duration-(--duration-base) group-data-[state=open]/collapsible-trigger:rotate-90"
      />
      {children}
    </CollapsiblePrimitive.Trigger>
  );
}

function CollapsibleContent({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof CollapsiblePrimitive.Content>, 'forceMount' | 'asChild'>) {
  const open = React.useContext(CollapsibleOpenContext);
  const reducedMotion = useReducedMotion();
  const transition = reducedMotion ? { duration: 0 } : transitions.slow;
  // Content stays mounted so local state survives; it is only taken out of the
  // accessibility tree and tab order once the closing animation has finished.
  const [settledClosed, setSettledClosed] = React.useState(!open);
  const hidden = !open && settledClosed;

  React.useEffect(() => {
    if (open) setSettledClosed(false);
  }, [open]);

  return (
    <CollapsiblePrimitive.Content
      data-slot="collapsible-content"
      forceMount
      asChild
      {...props}
      hidden={hidden}
    >
      <m.div
        initial={false}
        animate={open ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
        transition={transition}
        onAnimationComplete={() => {
          if (!open) setSettledClosed(true);
        }}
        className={cn('overflow-hidden', className)}
      >
        {children}
      </m.div>
    </CollapsiblePrimitive.Content>
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
