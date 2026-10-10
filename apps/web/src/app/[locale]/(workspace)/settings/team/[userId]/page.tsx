import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AssignmentList } from '@/components/team/assignment-list';
import { MemberForm } from '@/components/team/member-form';
import { requireArea } from '@/components/shell/session-guard';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { loadTeamMember } from '@/modules/team/server';
import {
  changeRoleAction,
  restoreAccessAction,
  revokeAccessAction,
  saveRatesAction,
  setClientAction,
  setProjectAction,
} from '../actions';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; userId: string }> };

export default async function TeamMemberPage({ params }: PageProps) {
  const { locale: requested, userId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const member = await loadTeamMember(session.claims, userId);
  if (!member) notFound();
  const t = await getTranslations('team');

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href="/settings/team" className="text-body-sm text-link hover:underline">
          {t('member.back')}
        </Link>
        <h1 className="text-title text-text">{member.name}</h1>
        <p className="text-body text-text-secondary">
          {t('member.summary', {
            email: member.email,
            role: t(`roles.${member.role}`),
            status: t(`status.${member.status}`),
          })}
        </p>
      </header>
      <MemberForm
        member={member}
        changeRole={changeRoleAction}
        revoke={revokeAccessAction}
        restore={restoreAccessAction}
        saveRates={saveRatesAction}
      />
      {member.role === 'project_manager' || member.role === 'freelancer' ? (
        <AssignmentList member={member} setClient={setClientAction} setProject={setProjectAction} />
      ) : null}
    </div>
  );
}
