import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ColleagueList } from '@/components/team/colleague-list';
import { InviteForm } from '@/components/team/invite-form';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadColleagues } from '@/modules/team/server';
import { portalRoomAccess } from '../../room-session';
import { changeColleagueRoleAction, inviteColleagueAction, revokeColleagueAction } from './actions';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

export default async function PortalColleaguesPage({ params }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const { clientId } = portalRoomAccess(session.ctx.clientRoles);
  const colleagues = clientId ? await loadColleagues(session.claims, clientId) : null;
  if (!colleagues) notFound();
  const t = await getTranslations('team');

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('colleagues.title')}</h1>
        <p className="text-body text-text-secondary">{t('colleagues.description')}</p>
      </header>
      <section
        aria-labelledby="colleagues-invite"
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="colleagues-invite" className="text-heading text-text">
          {t('invite.heading')}
        </h2>
        <InviteForm
          idPrefix="colleague"
          roles={['operational', 'client_finance', 'decision_maker']}
          invite={inviteColleagueAction}
        />
      </section>
      <ColleagueList
        colleagues={colleagues}
        changeRole={changeColleagueRoleAction}
        revoke={revokeColleagueAction}
      />
    </div>
  );
}
