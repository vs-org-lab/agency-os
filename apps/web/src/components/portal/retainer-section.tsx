'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@agency-os/ui/components/collapsible';
import { FormMessage } from '@/components/forms/form-message';
import { LimitRings } from '@/components/retainers/limit-rings';
import { RequestForm, type PortalRetainerActions } from '@/components/retainers/portal-retainer';
import { CreateDialog } from '@/components/ui/create-dialog';
import { useSearchParams } from 'next/navigation';
import { CardTabs } from '@agency-os/ui/components/card-tabs';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import type { ClientRetainerRequest, PortalRetainerView } from '@/modules/retainers';
import { PlanPanel } from './plan-panel';
import { RequestBoard } from './request-board';

export type PortalRetainerHome = {
  view: PortalRetainerView;
  requests: ClientRetainerRequest[];
  request: PortalRetainerActions['request'];
};

/** The plan's rings, the request-work dialog and the board of what the client asked for. */
export function RetainerSection({ retainer }: { retainer: PortalRetainerHome }) {
  const t = useTranslations('portal.dashboard');
  const tRetainers = useTranslations('retainers');
  const router = useRouter();
  const planId = useId();
  const pathname = usePathname();
  const params = useSearchParams();
  const layout = params.get('view') === 'list' ? 'list' : 'board';
  const { view, requests } = retainer;
  const canRequest = view.retainer.status === 'active' && !view.suspended;

  const request: PortalRetainerActions['request'] = async (input) => {
    const result = await retainer.request(input);
    if (result.ok) router.refresh();
    return result;
  };

  return (
    <>
      <section aria-labelledby={`${planId}-title`} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${planId}-title`} className="text-title-sm text-text">
            {t('plan.title')}
          </h2>
          {canRequest ? (
            <CreateDialog
              label={t('requestWork.label')}
              title={t('requestWork.title')}
              description={t('requestWork.description')}
            >
              {(close) => (
                <RequestForm
                  view={view}
                  request={request}
                  onDone={(outcome) => close({ message: tRetainers(`portal.request.${outcome}`) })}
                />
              )}
            </CreateDialog>
          ) : null}
        </div>
        {view.suspended && view.retainer.status === 'active' ? (
          <FormMessage tone="danger">{tRetainers('portal.suspended')}</FormMessage>
        ) : null}
        <LimitRings limits={view.limits} period={view.period} />
        <Collapsible>
          <CollapsibleTrigger>{t('plan.details')}</CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <PlanPanel
              plan={{
                tier: view.retainer.tier,
                limits: view.limits.map((entry) => ({ kind: entry.kind, limit: entry.limit })),
              }}
            />
          </CollapsibleContent>
        </Collapsible>
      </section>
      <section aria-label={t('board.title')} className="flex flex-col gap-2">
        <CardTabs
          title={t('board.title')}
          tabs={[
            { value: 'board', label: t('board.views.board') },
            { value: 'list', label: t('board.views.list') },
          ]}
          value={layout}
          onValueChange={(next) => router.replace(`${pathname}?view=${next}`, { scroll: false })}
        >
          <RequestBoard requests={requests} month={view.month} view={layout} />
        </CardTabs>
        <Link href="/portal/progress" className="self-end text-body-sm text-link hover:underline">
          {t('board.seeAll')}
        </Link>
      </section>
    </>
  );
}
