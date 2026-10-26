'use client';

import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { SidePanel } from '@agency-os/ui/components/side-panel';
import { notify } from './notify';
import type { CreateOverlayProps, CreateResult } from './create-overlay';

export function CreateSheet({
  label,
  title,
  description,
  icon,
  variant = 'default',
  defaultOpen = false,
  children,
}: CreateOverlayProps) {
  const t = useTranslations('interaction');
  const [open, setOpen] = useState(defaultOpen);

  const close = useCallback((result?: CreateResult) => {
    setOpen(false);
    if (result) notify.success(result.message);
  }, []);

  return (
    <SidePanel
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={description}
      closeLabel={t('close')}
      trigger={
        <Button type="button" variant={variant}>
          {icon ?? <Plus aria-hidden />}
          {label}
        </Button>
      }
    >
      {children(close)}
    </SidePanel>
  );
}
