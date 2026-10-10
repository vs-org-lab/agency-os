import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { isFounder } from '@/modules/commercial/server';
import { getVerifiedClaims } from '@/platform/session';
import { settingsNavItems } from './settings-items';
import { SettingsNav } from './settings-nav';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('settings.nav');
  const claims = await getVerifiedClaims();
  const founder = claims ? await isFounder(claims) : false;
  const items = settingsNavItems(founder).map((item) => ({
    href: item.href,
    label: t(item.labelKey),
  }));

  return (
    <div className="flex flex-col gap-6">
      <SettingsNav label={t('label')} items={items} />
      {children}
    </div>
  );
}
