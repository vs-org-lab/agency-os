import { defaultLocale, locales, type Locale } from '@agency-os/i18n';

import { PORTAL_PREVIEW_COOKIE } from '@/platform/preview-cookie';

const PREVIEW_ROLE_VALUES = ['decision_maker', 'operational', 'client_finance'] as const;
type PreviewRoleValue = (typeof PREVIEW_ROLE_VALUES)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The preview role named in a request, the decision maker when none or an unknown one is. */
export function previewRoleOf(value: string | null | undefined): PreviewRoleValue {
  return PREVIEW_ROLE_VALUES.find((role) => role === value) ?? 'decision_maker';
}

/** The cookie value: the client and the role the team previews as. */
export function previewCookieValue(clientId: string, role: PreviewRoleValue): string {
  return `${clientId}.${role}`;
}

export function parsePreviewCookie(
  value: string | undefined,
): { clientId: string; role: PreviewRoleValue } | null {
  const [clientId, role] = (value ?? '').split('.');
  if (!clientId || !UUID.test(clientId)) return null;
  return { clientId, role: previewRoleOf(role) };
}

/** A portal path the preview may open: inside the portal and without escapes. */
export function safePortalPath(value: string | null): string | null {
  if (!value || !/^\/portal(\/[a-z0-9-]+)*$/.test(value)) return null;
  return value;
}

export { PORTAL_PREVIEW_COOKIE };

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
  return locales.map((locale) => localizedPath(locale, '/portal'));
}

export function localizedPath(locale: Locale, path: string): string {
  return locale === defaultLocale ? path : `/${locale}${path}`;
}

/** The founder and project managers preview the portal; the database confirms the client. */
export function offersClientPreview(actor: { roles: readonly string[] }): boolean {
  return actor.roles.some((role) => role === 'founder' || role === 'project_manager');
}

/**
 * One `Set-Cookie` value per portal path. A response's cookie store keeps one cookie per name, so
 * the same name under several paths has to be written as separate headers.
 */
export function previewCookieHeaders(
  value: string,
  options: { secure: boolean; maxAgeSeconds: number },
): string[] {
  return portalCookiePaths().map((path) =>
    [
      `${PORTAL_PREVIEW_COOKIE}=${value}`,
      `Path=${path}`,
      `Max-Age=${options.maxAgeSeconds}`,
      'HttpOnly',
      'SameSite=Lax',
      ...(options.secure ? ['Secure'] : []),
    ].join('; '),
  );
}
