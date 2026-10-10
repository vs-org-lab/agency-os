import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { InviteForm } from '@/components/team/invite-form';
import { TeamTable } from '@/components/team/team-table';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadTeam } from '@/modules/team/server';
import { inviteTeamAction, resendTeamInvitationAction } from './actions';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

export default async function TeamSettingsPage({ params }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const members = await loadTeam(session.claims, new Date());
  if (!members) notFound();
  const t = await getTranslations('team');

  return (
    <div className="mx-auto flex w-full max-w-240 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="text-body text-text-secondary">{t('description')}</p>
      </header>
      <section
        aria-labelledby="team-invite"
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="team-invite" className="text-heading text-text">
          {t('invite.heading')}
        </h2>
        <InviteForm
          idPrefix="team"
          roles={['project_manager', 'freelancer', 'finance']}
          invite={inviteTeamAction}
        />
      </section>
      <TeamTable members={members} resend={resendTeamInvitationAction} />
    </div>
  );
}
