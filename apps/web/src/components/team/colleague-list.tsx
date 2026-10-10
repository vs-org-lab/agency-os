'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import type { ClientRole } from '@agency-os/db';
import { FormMessage } from '@/components/forms/form-message';
import type { ColleagueView } from '@/modules/team';
import { TEAM_FIELD, type TeamActionResult } from './team-errors';
import { useTeamAction } from './use-team-action';

const CLIENT_ROLES: readonly ClientRole[] = ['decision_maker', 'operational', 'client_finance'];

/** P-11: the client's portal users; the decision maker manages everyone but themselves. */
export function ColleagueList({
  colleagues,
  changeRole,
  revoke,
}: {
  colleagues: ColleagueView[];
  changeRole: (membershipId: string, role: ClientRole) => Promise<TeamActionResult>;
  revoke: (membershipId: string) => Promise<TeamActionResult>;
}) {
  const t = useTranslations('team');
  const { outcome, pending, run } = useTeamAction();

  return (
    <div className="flex flex-col gap-3">
      <ul
        aria-label={t('colleagues.label')}
        className="divide-y divide-border rounded-lg border border-border bg-surface"
      >
        {colleagues.map((colleague) => (
          <li
            key={colleague.membershipId}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-body font-medium text-text">{colleague.name}</span>
              <span className="truncate text-caption text-text-secondary">{colleague.email}</span>
            </span>
            {colleague.isSelf ? (
              <span className="flex items-center gap-2">
                <span className="text-body-sm text-text">{t(`roles.${colleague.role}`)}</span>
                <Badge variant="secondary">{t('colleagues.you')}</Badge>
              </span>
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{t(`status.${colleague.status}`)}</Badge>
                <select
                  aria-label={t('colleagues.roleLabel', { name: colleague.name })}
                  className={TEAM_FIELD}
                  value={colleague.role}
                  disabled={pending || colleague.status === 'revoked'}
                  onChange={(event) =>
                    run('saved', () =>
                      changeRole(colleague.membershipId, event.target.value as ClientRole),
                    )
                  }
                >
                  {CLIENT_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {t(`roles.${role}`)}
                    </option>
                  ))}
                </select>
                {colleague.status === 'revoked' ? null : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    aria-label={t('colleagues.revokeLabel', { name: colleague.name })}
                    onClick={() => run('saved', () => revoke(colleague.membershipId))}
                  >
                    {t('colleagues.revoke')}
                  </Button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      {outcome?.ok === false ? (
        <FormMessage tone="danger">{t(`errors.${outcome.error}`)}</FormMessage>
      ) : null}
      {outcome?.ok ? <FormMessage tone="success">{t('colleagues.saved')}</FormMessage> : null}
    </div>
  );
}
