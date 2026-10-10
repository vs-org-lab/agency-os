'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { TEAM_FIELD, type TeamActionResult } from './team-errors';
import { useTeamAction } from './use-team-action';

export type InvitableRole =
  | 'project_manager'
  | 'freelancer'
  | 'finance'
  | 'decision_maker'
  | 'operational'
  | 'client_finance';

export type InviteInput<R extends InvitableRole> = { fullName: string; email: string; role: R };

/** Invites a person with a role; used for the studio team and for portal colleagues. */
export function InviteForm<R extends InvitableRole>({
  idPrefix,
  roles,
  invite,
}: {
  idPrefix: string;
  roles: readonly R[];
  invite: (input: InviteInput<R>) => Promise<TeamActionResult>;
}) {
  const t = useTranslations('team');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<R>(roles[0] as R);
  const { outcome, setOutcome, pending, run } = useTeamAction();

  return (
    <form
      className="grid gap-3 md:grid-cols-[1fr_1fr_14rem_auto] md:items-end"
      onChange={() => setOutcome(null)}
      onSubmit={(event) => {
        event.preventDefault();
        run(
          'sent',
          () => invite({ fullName, email, role }),
          () => {
            setFullName('');
            setEmail('');
          },
        );
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-invite-name`}>{t('invite.name')}</Label>
        <Input
          id={`${idPrefix}-invite-name`}
          required
          maxLength={200}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-invite-email`}>{t('invite.email')}</Label>
        <Input
          id={`${idPrefix}-invite-email`}
          type="email"
          required
          maxLength={320}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-invite-role`}>{t('invite.role')}</Label>
        <select
          id={`${idPrefix}-invite-role`}
          className={TEAM_FIELD}
          value={role}
          onChange={(event) => setRole(event.target.value as R)}
        >
          {roles.map((option) => (
            <option key={option} value={option}>
              {t(`roles.${option as InvitableRole}`)}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {t('invite.submit')}
      </Button>
      <div className="md:col-span-4">
        {outcome?.ok === false ? (
          <FormMessage tone="danger">{t(`errors.${outcome.error}`)}</FormMessage>
        ) : null}
        {outcome?.ok ? <FormMessage tone="success">{t('invite.sent')}</FormMessage> : null}
      </div>
    </form>
  );
}
