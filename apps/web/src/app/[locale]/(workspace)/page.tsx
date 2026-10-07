import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@agency-os/ui/components/badge';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { commercialSession, loadToday } from '@/modules/commercial/server';
import { getVerifiedClaims } from '@/platform/session';

type PageProps = { params: Promise<{ locale: string }> };

export default async function StudioHomePage({ params }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const session = await commercialSession(await getVerifiedClaims());
  if (!session) {
    const t = await getTranslations('studio.home');
    return <EmptyState title={t('title')} description={t('description')} />;
  }

  const t = await getTranslations('studio.today');
  const format = await getFormatter();
  const items = await loadToday(session, new Date());

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="text-body text-text-secondary">{t('description')}</p>
      </header>
      {items.length === 0 ? (
        <EmptyState title={t('empty.title')} description={t('empty.description')} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <Link
                href={
                  item.kind === 'queue_b' ? '/applications?tab=queue_b' : `/pipeline/${item.dealId}`
                }
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-muted"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-body font-medium text-text">
                    {item.clientName}
                  </span>
                  <span className="text-caption text-text-secondary">
                    {t(`kinds.${item.kind}`, {
                      day: item.sequenceDay ?? 0,
                      time: format.dateTime(item.dueAt, { hour: '2-digit', minute: '2-digit' }),
                    })}
                  </span>
                </span>
                {item.overdue ? (
                  <Badge variant="secondary" className="bg-danger-bg text-danger">
                    {t('overdue')}
                  </Badge>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
