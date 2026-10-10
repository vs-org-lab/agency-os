'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { formatMoney, type Locale } from '@agency-os/i18n';
import { FormMessage } from '@/components/forms/form-message';
import { ActionButton } from '@/components/ui/action-button';
import { Link } from '@/i18n/navigation';
import { toMinorUnits } from '@/modules/contracts';
import type { TeamMemberView } from '@/modules/team';
import { teamError, type TeamActionResult, type TeamError } from './team-errors';

const STATUS_STYLE = {
  active: 'bg-success-bg text-success',
  invited: 'bg-surface-muted text-text-secondary',
  revoked: 'bg-danger-bg text-danger',
} as const;

/** S-12 › Equipa: one row per person with status, clients, weekly load, availability and cost. */
export function TeamTable({
  members,
  resend,
}: {
  members: TeamMemberView[];
  resend: (membershipId: string) => Promise<TeamActionResult>;
}) {
  const t = useTranslations('team');
  const locale = useLocale() as Locale;
  const [failure, setFailure] = useState<TeamError | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <ul
        aria-label={t('table.label')}
        className="divide-y divide-border rounded-lg border border-border bg-surface"
      >
        {members.map((member) => (
          <li
            key={member.userId}
            className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_auto] md:items-center"
          >
            <span className="flex min-w-0 flex-col">
              <Link
                href={`/settings/team/${member.userId}`}
                className="truncate text-body font-medium text-text hover:underline"
              >
                {member.name}
              </Link>
              <span className="truncate text-caption text-text-secondary">{member.email}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-body-sm text-text">{t(`roles.${member.role}`)}</span>
              <Badge variant="secondary" className={STATUS_STYLE[member.status]}>
                {t(`status.${member.status}`)}
              </Badge>
            </span>
            <span className="flex flex-col text-caption text-text-secondary">
              <span>{t('table.clientCount', { count: member.clientCount })}</span>
              <span>
                {t('table.loadValue', {
                  tasks: member.load.tasksThisWeek,
                  projects: member.load.activeProjects,
                })}
              </span>
              <span>
                {member.rates?.weeklyHours != null
                  ? t('table.hours', { hours: member.rates.weeklyHours })
                  : t('table.noHours')}
              </span>
              <span>
                {member.rates?.hourlyCost
                  ? t('table.perHour', {
                      amount: formatMoney(
                        toMinorUnits(member.rates.hourlyCost),
                        member.rates.currency,
                        locale,
                      ),
                    })
                  : t('table.noRate')}
              </span>
            </span>
            {member.status === 'invited' ? (
              <ActionButton
                variant="outline"
                labels={{
                  idle: t('table.resend'),
                  pending: t('table.resending'),
                  done: t('table.resentShort'),
                }}
                ariaLabel={t('table.resendLabel', { name: member.name })}
                action={() => resend(member.membershipId)}
                onResult={(result) => setFailure(result.ok ? null : teamError(result.code))}
              />
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>
      {failure ? <FormMessage tone="danger">{t(`errors.${failure}`)}</FormMessage> : null}
    </div>
  );
}
