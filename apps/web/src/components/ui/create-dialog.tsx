'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@agency-os/ui/components/dialog';
import { notify } from './notify';
import type { CreateOverlayProps, CreateResult } from './create-overlay';

// Offsets the zoom origin from the dialog centre towards the trigger, so the dialog
// appears to grow out of the button that opened it.
function originFrom(trigger: HTMLElement): CSSProperties {
  const rect = trigger.getBoundingClientRect();
  const offsetX = rect.left + rect.width / 2 - window.innerWidth / 2;
  const offsetY = rect.top + rect.height / 2 - window.innerHeight / 2;
  return { transformOrigin: `calc(50% + ${offsetX}px) calc(50% + ${offsetY}px)` };
}

export function CreateDialog({
  label,
  triggerLabel,
  title,
  description,
  icon,
  variant = 'default',
  defaultOpen = false,
  openRequested = false,
  onClose,
  children,
}: CreateOverlayProps) {
  const t = useTranslations('interaction');
  const [open, setOpen] = useState(defaultOpen || openRequested);
  const [origin, setOrigin] = useState<CSSProperties>();

  useEffect(() => {
    if (openRequested) setOpen(true);
  }, [openRequested]);

  const changeOpen = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) onClose?.();
    },
    [onClose],
  );

  const close = useCallback(
    (result?: CreateResult) => {
      changeOpen(false);
      if (result) notify.success(result.message);
    },
    [changeOpen],
  );

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          aria-label={triggerLabel}
          onClick={(event) => setOrigin(originFrom(event.currentTarget))}
        >
          {icon ?? <Plus aria-hidden />}
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent
        closeLabel={t('close')}
        style={origin}
        className="max-h-[90vh] overflow-y-auto"
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children(close)}
      </DialogContent>
    </Dialog>
  );
}
