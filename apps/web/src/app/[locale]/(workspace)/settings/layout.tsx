import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { isFounder } from '@/modules/commercial/server';
import { getVerifiedClaims } from '@/platform/session';
import { SettingsNav } from './settings-nav';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('settings.nav');
  const claims = await getVerifiedClaims();
  const founder = claims ? await isFounder(claims) : false;
  const items = [
    { href: '/settings/sessions', label: t('sessions') },
    ...(founder
      ? [
          { href: '/settings/integrations', label: t('integrations') },
          { href: '/settings/application', label: t('application') },
          { href: '/settings/booking', label: t('booking') },
          { href: '/settings/templates', label: t('templates') },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <SettingsNav label={t('label')} items={items} />
      {children}
    </div>
  );
}
