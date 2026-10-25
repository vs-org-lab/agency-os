import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@agency-os/ui/components/button';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { cn } from '@agency-os/ui/lib/utils';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { PIPELINE_STAGES, type PipelineFilters, type PipelineStage } from '@/modules/commercial';
import { commercialSession, loadPipelineCards } from '@/modules/commercial/server';
import { getVerifiedClaims } from '@/platform/session';
import { moveDealAction } from './actions';
import { Board } from './board';
import { DealList } from './deal-list';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    view?: string;
    stage?: string;
    overdue?: string;
    mine?: string;
    q?: string;
  }>;
};

const STAGES = PIPELINE_STAGES.map((entry) => entry.stage);

export default async function PipelinePage({ params, searchParams }: PageProps) {
  setRequestLocale(requireLocale((await params).locale));
  const session = await commercialSession(await getVerifiedClaims());
  if (!session) notFound();

  const t = await getTranslations('commercial');
  const query = await searchParams;
  const view = query.view === 'list' ? 'list' : 'board';
  const filters: PipelineFilters = {
    stage: STAGES.includes(query.stage as PipelineStage)
      ? (query.stage as PipelineStage)
      : undefined,
    overdueOnly: query.overdue === '1',
    ownerUserId: query.mine === '1' ? session.actor.userId : undefined,
    search: query.q?.slice(0, 100),
  };
  const filtered = Boolean(
    filters.stage || filters.overdueOnly || filters.ownerUserId || filters.search,
  );
  const cards = await loadPipelineCards(session, view === 'list' ? filters : {});

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-title text-text">{t('board.title')}</h1>
          <p className="text-body text-text-secondary">{t('board.description')}</p>
        </div>
        <nav
          aria-label={t('board.views.label')}
          className="inline-flex rounded-md bg-surface-muted p-0.5"
        >
          {(['board', 'list'] as const).map((option) => (
            <Link
              key={option}
              href={option === 'board' ? '/pipeline' : '/pipeline?view=list'}
              aria-current={view === option ? 'page' : undefined}
              className={cn(
                'rounded-sm px-3 py-1.5 text-body-sm',
                view === option ? 'bg-surface text-text shadow-xs' : 'text-text-secondary',
              )}
            >
              {t(`board.views.${option}`)}
            </Link>
          ))}
        </nav>
      </header>

      {view === 'list' ? (
        <form className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 md:flex-row md:items-end">
          <input type="hidden" name="view" value="list" />
          <label className="flex flex-1 flex-col gap-1 text-label text-text">
            {t('board.filters.search')}
            <input
              name="q"
              defaultValue={filters.search ?? ''}
              className="h-11 rounded-md border border-border bg-surface px-3 text-body md:h-9"
            />
          </label>
          <label className="flex flex-col gap-1 text-label text-text">
            {t('board.filters.label')}
            <select
              name="stage"
              defaultValue={filters.stage ?? ''}
              className="h-11 rounded-md border border-border bg-surface px-3 text-body md:h-9"
            >
              <option value="">{t('board.filters.allStages')}</option>
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {t(`pipeline.stages.${stage}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-body-sm text-text md:min-h-9">
            <input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdueOnly} />
            {t('board.filters.overdue')}
          </label>
          <label className="flex min-h-11 items-center gap-2 text-body-sm text-text md:min-h-9">
            <input
              type="checkbox"
              name="mine"
              value="1"
              defaultChecked={Boolean(filters.ownerUserId)}
            />
            {t('board.filters.mine')}
          </label>
          <Button type="submit" variant="outline" className="h-11 md:h-9">
            {t('board.filters.apply')}
          </Button>
        </form>
      ) : null}

      {cards.length === 0 ? (
        filtered && view === 'list' ? (
          <EmptyState
            title={t('board.noResults.title')}
            description={t('board.noResults.description')}
          />
        ) : (
          <EmptyState title={t('board.empty.title')} description={t('board.empty.description')} />
        )
      ) : view === 'list' ? (
        <DealList cards={cards} />
      ) : (
        <Board cards={cards} move={moveDealAction} />
      )}
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'commercial.board.title');
}
