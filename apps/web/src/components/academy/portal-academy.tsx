'use client';

import { useId, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { AcademyItemKind } from '@agency-os/db';
import { useRouter } from '@/i18n/navigation';
import type { AcademyItemView, PortalAcademyView } from '@/modules/academy';
import { SessionList } from './room-academy';
import type { AcademyResult } from './shared';

const KINDS: AcademyItemKind[] = ['tutorial', 'manual', 'checklist'];

function Material({ item }: { item: AcademyItemView }) {
  const t = useTranslations('academy');
  if (item.url) {
    const action = item.kind === 'tutorial' ? t('externalVideo') : t('externalLink');
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        aria-label={t('itemAction', { action, title: item.title })}
        className="text-body-sm text-link"
      >
        {action}
      </a>
    );
  }
  if (!item.file) return <p className="text-body-sm text-text-secondary">{t('noMaterial')}</p>;
  const href = `/api/library/files/${item.file.id}`;
  if (item.kind === 'tutorial') {
    return (
      // Library videos carry no caption track; the item's description gives the context.
      <video
        src={href}
        controls
        preload="none"
        aria-label={item.title}
        className="w-full rounded-md border border-border bg-black"
      />
    );
  }
  return (
    <a
      href={href}
      aria-label={t('itemAction', { action: t('download'), title: item.title })}
      className="text-body-sm text-link"
    >
      {t('download')}
    </a>
  );
}

function PortalItem({
  item,
  canCheck,
  check,
  pending,
}: {
  item: AcademyItemView;
  canCheck: boolean;
  check: (stepId: string, done: boolean) => void;
  pending: boolean;
}) {
  const t = useTranslations('academy');
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <h3 id={titleId} className="text-body font-medium text-text">
        {item.title}
      </h3>
      {item.description ? <p className="text-body-sm text-text">{item.description}</p> : null}
      {item.kind === 'checklist' ? (
        <div className="flex flex-col gap-2">
          <p className="text-body-sm text-text-secondary">
            {t('progress', { done: item.progress.done, total: item.progress.total })}
          </p>
          <ul className="flex flex-col gap-1">
            {item.steps.map((step) => (
              <li key={step.id} className="flex items-center gap-2 text-body-sm text-text">
                <input
                  type="checkbox"
                  id={`${titleId}-${step.id}`}
                  checked={step.done}
                  disabled={!canCheck || pending}
                  onChange={() => check(step.id, !step.done)}
                />
                <label htmlFor={`${titleId}-${step.id}`}>{step.text}</label>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Material item={item} />
      )}
    </article>
  );
}

/** P-09: the published academy and the training sessions held with the client's team. */
export function PortalAcademy({
  view,
  check,
}: {
  view: PortalAcademyView;
  check: (input: { stepId: string; done: boolean }) => Promise<AcademyResult>;
}) {
  const t = useTranslations('academy');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const sessionsId = useId();
  const onCheck = (stepId: string, done: boolean) =>
    startTransition(async () => {
      const result = await check({ stepId, done }).catch(() => ({ ok: false as const }));
      if (result.ok) router.refresh();
    });

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        {view.items.length === 0 ? (
          <p className="text-body-sm text-text-secondary">{t('portalEmpty')}</p>
        ) : null}
      </header>
      {KINDS.map((kind) => {
        const items = view.items.filter((item) => item.kind === kind);
        if (items.length === 0) return null;
        return (
          <section key={kind} className="flex flex-col gap-3">
            <h2 className="text-body font-medium text-text">{t(`sections.${kind}`)}</h2>
            {items.map((item) => (
              <PortalItem
                key={item.id}
                item={item}
                canCheck={view.canCheck}
                check={onCheck}
                pending={pending}
              />
            ))}
          </section>
        );
      })}
      {view.sessions.length > 0 ? (
        <section aria-labelledby={sessionsId} className="flex flex-col gap-3">
          <h2 id={sessionsId} className="text-body font-medium text-text">
            {t('sessions.title')}
          </h2>
          <SessionList sessions={view.sessions} />
        </section>
      ) : null}
    </div>
  );
}
