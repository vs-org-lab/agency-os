export type SettingsLabelKey =
  'sessions' | 'organization' | 'team' | 'integrations' | 'application' | 'booking' | 'templates';

const FOUNDER_ITEMS: Array<{ href: string; labelKey: SettingsLabelKey }> = [
  { href: '/settings/organization', labelKey: 'organization' },
  { href: '/settings/team', labelKey: 'team' },
  { href: '/settings/integrations', labelKey: 'integrations' },
  { href: '/settings/application', labelKey: 'application' },
  { href: '/settings/booking', labelKey: 'booking' },
  { href: '/settings/templates', labelKey: 'templates' },
];

/** S-12 tabs: everyone manages their sessions; founders also configure the organisation. */
export function settingsNavItems(
  founder: boolean,
): Array<{ href: string; labelKey: SettingsLabelKey }> {
  return [{ href: '/settings/sessions', labelKey: 'sessions' }, ...(founder ? FOUNDER_ITEMS : [])];
}
