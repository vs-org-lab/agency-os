'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import type { OrgRole } from '@agency-os/db';
import { currencies, type Currency } from '@agency-os/i18n';
import { FormMessage } from '@/components/forms/form-message';
import { HoldToConfirm } from '@/components/ui/hold-to-confirm';
import type { MemberView } from '@/modules/team';
import { TEAM_FIELD, type TeamActionResult } from './team-errors';
import { useTeamAction, type TeamOutcome } from './use-team-action';

const ROLES: readonly OrgRole[] = ['founder', 'project_manager', 'freelancer', 'finance'];

export type RatesInput = {
  hourlyCost: string | null;
  currency: Currency;
  weeklyHours: number | null;
};

const SUCCESS_KEYS = {
  role: 'member.roleSaved',
  revoked: 'member.revoked',
  restored: 'member.restored',
  rates: 'member.ratesSaved',
} as const;

function Outcome({ outcome }: { outcome: TeamOutcome }) {
  const t = useTranslations('team');
  if (outcome?.ok === false) {
    return <FormMessage tone="danger">{t(`errors.${outcome.error}`)}</FormMessage>;
  }
  if (outcome?.ok) {
    return (
      <FormMessage tone="success">
        {t(SUCCESS_KEYS[outcome.key as keyof typeof SUCCESS_KEYS])}
      </FormMessage>
    );
  }
  return null;
}

/** The member's role, access, hourly cost and weekly hours. */
export function MemberForm({
  member,
  changeRole,
  revoke,
  restore,
  saveRates,
}: {
  member: MemberView;
  changeRole: (userId: string, role: OrgRole) => Promise<TeamActionResult>;
  revoke: (userId: string) => Promise<TeamActionResult>;
  restore: (userId: string) => Promise<TeamActionResult>;
  saveRates: (userId: string, rates: RatesInput) => Promise<TeamActionResult>;
}) {
  const t = useTranslations('team');
  const [role, setRole] = useState<OrgRole>(member.role);
  const [hourlyCost, setHourlyCost] = useState(member.rates?.hourlyCost ?? '');
  const [currency, setCurrency] = useState<Currency>(member.rates?.currency ?? 'EUR');
  const [weeklyHours, setWeeklyHours] = useState(
    member.rates?.weeklyHours != null ? String(member.rates.weeklyHours) : '',
  );
  const access = useTeamAction();
  const rates = useTeamAction();

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="member-access" className="flex flex-col gap-3">
        <h2 id="member-access" className="text-heading text-text">
          {t('member.access')}
        </h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            access.run('role', () => changeRole(member.userId, role));
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="member-role">{t('member.role')}</Label>
            <select
              id="member-role"
              className={TEAM_FIELD}
              value={role}
              onChange={(event) => setRole(event.target.value as OrgRole)}
            >
              {ROLES.map((option) => (
                <option key={option} value={option}>
                  {t(`roles.${option}`)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline" disabled={access.pending}>
            {t('member.saveRole')}
          </Button>
          {member.status === 'revoked' ? (
            <Button
              type="button"
              disabled={access.pending}
              onClick={() => access.run('restored', () => restore(member.userId))}
            >
              {t('member.restore')}
            </Button>
          ) : (
            <HoldToConfirm
              label={t('member.revoke')}
              disabled={access.pending}
              onConfirm={() => access.run('revoked', () => revoke(member.userId))}
            />
          )}
        </form>
        <Outcome outcome={access.outcome} />
      </section>

      <section aria-labelledby="member-rates" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="member-rates" className="text-heading text-text">
            {t('member.rates')}
          </h2>
          <p className="text-body-sm text-text-secondary">{t('member.ratesHint')}</p>
        </div>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            rates.run('rates', () =>
              saveRates(member.userId, {
                hourlyCost: hourlyCost.trim() === '' ? null : hourlyCost.trim(),
                currency,
                weeklyHours: weeklyHours.trim() === '' ? null : Number(weeklyHours),
              }),
            );
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="member-hourly-cost">{t('member.hourlyCost')}</Label>
            <Input
              id="member-hourly-cost"
              inputMode="decimal"
              className="w-32"
              value={hourlyCost}
              onChange={(event) => setHourlyCost(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="member-currency">{t('member.currency')}</Label>
            <select
              id="member-currency"
              className={TEAM_FIELD}
              value={currency}
              onChange={(event) => setCurrency(event.target.value as Currency)}
            >
              {currencies.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="member-weekly-hours">{t('member.weeklyHours')}</Label>
            <Input
              id="member-weekly-hours"
              type="number"
              min={0}
              max={80}
              className="w-28"
              value={weeklyHours}
              onChange={(event) => setWeeklyHours(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={rates.pending}>
            {t('member.saveRates')}
          </Button>
        </form>
        <Outcome outcome={rates.outcome} />
      </section>
    </div>
  );
}
