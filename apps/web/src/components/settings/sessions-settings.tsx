import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@agency-os/ui/components/badge';
import type { ActiveSession } from '@/modules/identity';
import { ChangePasswordForm } from './change-password-form';
import { RevokeSessionButton } from './revoke-session-button';

export async function SessionsSettings({ sessions }: { sessions: ActiveSession[] }) {
  const t = await getTranslations('sessions');
  const format = await getFormatter();
  const others = sessions.filter((session) => !session.isCurrent);

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8">
      <section aria-labelledby="sessions-title" className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h1 id="sessions-title" className="text-title text-text">
            {t('title')}
          </h1>
          <p className="text-body text-text-secondary">{t('description')}</p>
        </header>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-body-sm font-medium text-text">
                    {session.userAgent ?? t('unknownDevice')}
                  </span>
                  {session.isCurrent ? (
                    <Badge variant="secondary" className="bg-info-bg text-info">
                      {t('current')}
                    </Badge>
                  ) : null}
                </div>
                <span className="flex flex-wrap gap-x-2 text-caption text-text-tertiary">
                  <span>
                    {t('lastActiveDetail', { time: format.relativeTime(session.lastActiveAt) })}
                  </span>
                  {session.ip ? <span className="font-mono">{session.ip}</span> : null}
                </span>
              </div>
              <RevokeSessionButton sessionId={session.id} />
            </li>
          ))}
        </ul>
        {others.length === 0 ? (
          <p className="text-body-sm text-text-secondary">{t('empty')}</p>
        ) : null}
      </section>

      <section aria-labelledby="password-title" className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h2 id="password-title" className="text-title-sm text-text">
            {t('changePasswordTitle')}
          </h2>
          <p className="text-body text-text-secondary">{t('changePasswordDescription')}</p>
        </header>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
