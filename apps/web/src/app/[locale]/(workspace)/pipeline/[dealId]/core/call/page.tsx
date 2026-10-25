import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { requireLocale } from '@/i18n/require-locale';
import { canWritePipeline } from '@/modules/commercial';
import { commercialSession, loadDealDetail } from '@/modules/commercial/server';
import { loadCoreWorkspace } from '@/modules/diagnosis/server';
import { getVerifiedClaims } from '@/platform/session';
import { CallMode } from './call-mode';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; dealId: string }> };

export default async function CallModePage({ params }: PageProps) {
  const { locale: requested, dealId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  if (!z.uuid().safeParse(dealId).success) notFound();
  const session = await commercialSession(await getVerifiedClaims());
  if (!session || !canWritePipeline(session.actor)) notFound();
  const [detail, core] = await Promise.all([
    loadDealDetail(session, dealId, locale),
    loadCoreWorkspace(session, dealId),
  ]);
  if (!detail || !core) notFound();

  return (
    <CallMode
      engagementId={core.engagementId}
      dealId={dealId}
      companyName={detail.client.name}
      guide={core.briefing.guide}
      notes={core.briefing.notes}
      observations={core.findings.filter((finding) => finding.bringToCall)}
      transcript={core.briefing.transcript}
      latestRecording={core.latestRecording}
      locale={locale}
    />
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'shell.studioNav.pipeline');
}
