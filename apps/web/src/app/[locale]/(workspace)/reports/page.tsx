import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { ReportsScreen } from '@/components/reports/reports-screen';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { reportYear } from '@/modules/reports';
import { loadTeamReports } from '@/modules/reports/server';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string }>;
};

const lisbonYear = () =>
  Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date()).slice(0, 4),
  );

/** S-11: the founder's team reports for a year. */
export default async function ReportsPage({ params, searchParams }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const year = reportYear((await searchParams).year, lisbonYear());
  const view = year === null ? null : await loadTeamReports(session.claims, year);
  if (!view) notFound();

  return <ReportsScreen view={view} />;
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'reports.title');
}
