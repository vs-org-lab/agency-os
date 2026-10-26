'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@agency-os/ui/components/dialog';
import { LayoutGroup, m, transitions } from '@agency-os/ui/motion';

const STEPS = ['work', 'approve', 'request'] as const;

/**
 * The portal's welcome on a client's first visit: three steps, skippable at any point. Closing it
 * in any way records the visit, so it shows once per user. It never opens in a staff preview.
 */
export function OnboardingDialog({
  onSeen,
  preview = false,
}: {
  onSeen: () => Promise<void>;
  preview?: boolean;
}) {
  const t = useTranslations('portal.onboarding');
  const tInteraction = useTranslations('interaction');
  const [open, setOpen] = useState(!preview);
  const [index, setIndex] = useState(0);
  if (preview) return null;

  const step = STEPS[index] ?? STEPS[0];
  const last = index === STEPS.length - 1;
  const close = () => {
    setOpen(false);
    void onSeen().catch(() => undefined);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent closeLabel={tInteraction('close')} aria-label={t('label')}>
        <DialogHeader>
          <DialogTitle>{t(`steps.${step}.title`)}</DialogTitle>
          <DialogDescription>{t(`steps.${step}.body`)}</DialogDescription>
        </DialogHeader>
        <LayoutGroup id="portal-onboarding-steps">
          <ol
            aria-label={t('step', { current: index + 1, total: STEPS.length })}
            className="flex items-center justify-center gap-2"
          >
            {STEPS.map((name, position) => (
              <li
                key={name}
                aria-current={position === index ? 'step' : undefined}
                className="relative size-2 rounded-full bg-border"
              >
                {position === index ? (
                  <m.span
                    layoutId="portal-onboarding-dot"
                    transition={transitions.morph}
                    className="absolute -inset-0.5 rounded-full bg-brand"
                  />
                ) : null}
              </li>
            ))}
          </ol>
        </LayoutGroup>
        <DialogFooter className="items-center sm:justify-between">
          <Button type="button" variant="ghost" onClick={close}>
            {t('skip')}
          </Button>
          <div className="flex gap-2">
            {index > 0 ? (
              <Button type="button" variant="outline" onClick={() => setIndex(index - 1)}>
                {t('previous')}
              </Button>
            ) : null}
            {last ? (
              <Button type="button" onClick={close}>
                {t('start')}
              </Button>
            ) : (
              <Button type="button" onClick={() => setIndex(index + 1)}>
                {t('next')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
