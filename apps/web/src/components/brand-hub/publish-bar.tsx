'use client';

import { useState, useTransition } from 'react';
import { Share2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { FormMessage } from '@/components/forms/form-message';
import type { HubApprovalState } from '@/modules/brand-hub';
import { hubError, type ActionResult, type HubError } from './hub-errors';

type Notice = 'published' | 'asked' | 'shared' | HubError;

/** RF-094: where the draft stands, Partilhar, and, for room writers, Publicar and Pedir aprovação. */
export function PublishBar({
  hubId,
  unpublishedChanges,
  lastPublishedAt,
  approval,
  canPublish,
  publish,
  askApproval,
  onChanged,
}: {
  hubId: string;
  unpublishedChanges: boolean;
  lastPublishedAt: string | null;
  approval: HubApprovalState;
  canPublish: boolean;
  publish: (hubId: string) => Promise<ActionResult>;
  askApproval: (hubId: string) => Promise<ActionResult>;
  onChanged: () => void;
}) {
  const t = useTranslations('brandHub.publish');
  const te = useTranslations('brandHub.errors');
  const format = useFormatter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult>, success: Notice) =>
    startTransition(async () => {
      const outcome = await action().catch(() => ({ ok: false, code: 'not_found' }) as const);
      setNotice(outcome.ok ? success : hubError(outcome.code));
      if (outcome.ok) onChanged();
    });

  const share = async () => {
    const url = new URL('/portal/hub', window.location.origin).toString();
    const copied = await navigator.clipboard?.writeText(url).then(
      () => true,
      () => false,
    );
    setNotice(copied ? 'shared' : 'not_found');
  };

  const status =
    lastPublishedAt === null ? 'neverPublished' : unpublishedChanges ? 'unpublished' : 'upToDate';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={status === 'upToDate' ? 'secondary' : 'default'}>{t(status)}</Badge>
        {lastPublishedAt ? (
          <span className="text-body-sm text-text-secondary">
            {t('lastPublished', {
              date: format.dateTime(new Date(lastPublishedAt), {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </span>
        ) : null}
        <span className="text-body-sm text-text-secondary">{t(`approval.${approval}`)}</span>
        <div className="ms-auto flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={share}>
            <Share2 aria-hidden="true" />
            {t('share')}
          </Button>
          {canPublish ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || lastPublishedAt === null || approval === 'pending'}
                onClick={() => run(() => askApproval(hubId), 'asked')}
              >
                {t('askApproval')}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={pending || !unpublishedChanges}
                onClick={() => run(() => publish(hubId), 'published')}
              >
                {pending ? t('publishing') : t('publish')}
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {notice === 'published' || notice === 'asked' || notice === 'shared' ? (
        <FormMessage tone="success">{t(notice)}</FormMessage>
      ) : notice ? (
        <FormMessage tone="danger">{te(notice)}</FormMessage>
      ) : null}
    </div>
  );
}
