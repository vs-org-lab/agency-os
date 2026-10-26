import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { PortalAcademy } from '@/components/academy/portal-academy';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadClientPortalAcademy } from '@/modules/academy/server';
import { checkAcademyStepAction } from '../../academy-actions';
import { portalRoomAccess } from '../room-session';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

/** P-09: the published academy and the training sessions of the client's team. */
export default async function PortalAcademyPage({ params }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const access = portalRoomAccess(session.ctx.clientRoles);
  const view =
    access.clientId && access.readsRoom
      ? await loadClientPortalAcademy(session.claims, access.clientId)
      : null;
  if (!view) notFound();

  return <PortalAcademy view={view} check={checkAcademyStepAction} />;
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'academy.title');
}
