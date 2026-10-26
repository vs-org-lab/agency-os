import { Plug } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, type ReactNode } from 'react';

const SEPARATOR = ' · ';

export type ConnectedItem = {
  key: string;
  title: string;
  account: string;
  since: Date;
  action?: ReactNode;
};

export function ConnectedList({ items }: { items: ConnectedItem[] }) {
  const t = useTranslations('settings.integrations.connected');
  const format = useFormatter();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-title-sm text-text">
        {t('title')}
      </h2>
      {items.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-3 px-4 py-3">
              <Plug aria-hidden="true" className="size-4 shrink-0 text-text-tertiary" />
              <p className="min-w-0 flex-1 text-body-sm text-text">
                <span className="font-medium">{item.title}</span>
                <span className="text-text-secondary">
                  {SEPARATOR}
                  {item.account}
                  {SEPARATOR}
                  {t('since', { date: format.dateTime(item.since, { dateStyle: 'medium' }) })}
                </span>
              </p>
              {item.action}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
