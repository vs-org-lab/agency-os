import { defaultLocale, locales, type Locale } from '@agency-os/i18n';

export { PORTAL_PREVIEW_COOKIE } from '@/platform/preview-cookie';

/** The portal screen that shows the client what a room section shows the team. */
const PORTAL_SECTION: Record<string, string> = {
  updates: '/portal/updates',
  docs: '/portal/docs',
  reports: '/portal/docs',
  library: '/portal/library',
  hub: '/portal/hub',
  academy: '/portal/academy',
  retainer: '/portal/progress',
  outcome: '/portal/progress',
  proofs: '/portal/proofs',
};

/**
 * The portal path for a room path such as `/c/:client/docs`: the matching section, or the portal
 * home for sections the client has no screen for (tasks, agenda, results). The project selection
 * follows on the screens that take one.
 */
export function portalPathForRoom(roomPath: string, projectId?: string | null): string {
  const section = roomPath.split('/').filter(Boolean)[2];
  const path = (section && PORTAL_SECTION[section]) ?? '/portal';
  return projectId && path === '/portal/updates' ? `${path}?project=${projectId}` : path;
}

/** The portal path under each locale prefix, which scopes the preview cookie to the portal. */
export function portalCookiePaths(): string[] {
  return locales.map((locale) => localizedPortalPath(locale, '/portal'));
}

export function localizedPortalPath(locale: Locale, path: string): string {
  return locale === defaultLocale ? path : `/${locale}${path}`;
}

/** The founder and project managers preview the portal; the database confirms the client. */
export function offersClientPreview(actor: { roles: readonly string[] }): boolean {
  return actor.roles.some((role) => role === 'founder' || role === 'project_manager');
}
