import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@agency-os/ui/components/badge';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@agency-os/ui/components/table';
import { cn } from '@agency-os/ui/lib/utils';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { canWritePipeline } from '@/modules/commercial';
import { commercialSession, loadApplications } from '@/modules/commercial/server';
import { getVerifiedClaims } from '@/platform/session';
import { ReviewButtons } from './review-buttons';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; q?: string }>;
};

export default async function ApplicationsPage({ params, searchParams }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const session = await commercialSession(await getVerifiedClaims());
  if (!session) notFound();

  const t = await getTranslations('commercial.applications');
  const format = await getFormatter();
  const query = await searchParams;
  const tab = query.tab === 'queue_b' ? 'queue_b' : 'all';
  const search = query.q?.slice(0, 100);
  const [rows, queue] = await Promise.all([
    loadApplications(session, { tab, search }),
    loadApplications(session, { tab: 'queue_b' }),
  ]);
  const writable = canWritePipeline(session.actor);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="text-body text-text-secondary">{t('description')}</p>
      </header>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav
          aria-label={t('tabs.label')}
          className="inline-flex self-start rounded-md bg-surface-muted p-0.5"
        >
          {(
            [
              ['all', '/applications', t('tabs.all')],
              ['queue_b', '/applications?tab=queue_b', t('tabs.queueB', { count: queue.length })],
            ] as const
          ).map(([key, href, label]) => (
            <Link
              key={key}
              href={href}
              aria-current={tab === key ? 'page' : undefined}
              className={cn(
                'rounded-sm px-3 py-1.5 text-body-sm',
                tab === key ? 'bg-surface text-text shadow-xs' : 'text-text-secondary',
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <form className="flex gap-2">
          {tab === 'queue_b' ? <input type="hidden" name="tab" value="queue_b" /> : null}
          <label className="sr-only" htmlFor="applications-search">
            {t('search')}
          </label>
          <input
            id="applications-search"
            name="q"
            defaultValue={search ?? ''}
            placeholder={t('search')}
            className="h-11 w-full rounded-md border border-border bg-surface px-3 text-body md:h-9 md:w-72"
          />
        </form>
      </div>

      {rows.length === 0 ? (
        tab === 'queue_b' ? (
          <EmptyState title={t('queueEmpty.title')} description={t('queueEmpty.description')} />
        ) : (
          <EmptyState title={t('empty.title')} description={t('empty.description')} />
        )
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.company')}</TableHead>
                <TableHead>{t('columns.contact')}</TableHead>
                <TableHead className="text-right">{t('columns.score')}</TableHead>
                <TableHead>{t('columns.path')}</TableHead>
                <TableHead>{t('columns.source')}</TableHead>
                <TableHead>{t('columns.date')}</TableHead>
                {tab === 'queue_b' && writable ? (
                  <TableHead>{t('columns.actions')}</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    <Link href={`/pipeline/${row.dealId}`} className="text-text hover:underline">
                      {row.companyName}
                    </Link>
                  </TableCell>
                  <TableCell>{row.anonymized ? t('anonymized') : row.contactName}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.score}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{row.path.toUpperCase()}</Badge>
                      {row.reviewDecision ? (
                        <span className="text-caption text-text-tertiary">
                          {t('decided', { path: row.reviewDecision.toUpperCase() })}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-text-secondary">
                    {[row.utmSource, row.utmCampaign].filter(Boolean).join(' · ') || t('direct')}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {format.dateTime(row.createdAt, { dateStyle: 'medium' })}
                  </TableCell>
                  {tab === 'queue_b' && writable ? (
                    <TableCell>
                      <ReviewButtons applicationId={row.id} companyName={row.companyName} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
