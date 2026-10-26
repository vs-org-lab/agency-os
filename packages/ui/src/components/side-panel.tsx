'use client';

import type { ReactNode } from 'react';
import { cn } from '@agency-os/ui/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@agency-os/ui/components/sheet';

type SidePanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  closeLabel: string;
  description?: string;
  trigger?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
  className?: string;
};

function SidePanel({
  open,
  onOpenChange,
  title,
  closeLabel,
  description,
  trigger,
  actions,
  tabs,
  children,
  className,
}: SidePanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent
        side="right"
        closeLabel={closeLabel}
        className={cn('w-full gap-0 sm:max-w-none md:w-[480px]', className)}
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <SheetHeader className="gap-3 border-b border-border pr-12">
          <SheetTitle className="text-title-sm text-text">{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          {tabs}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export { SidePanel };
export type { SidePanelProps };
