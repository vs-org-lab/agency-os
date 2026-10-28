import { describe, expect, it } from 'vitest';
import {
  localizedPath,
  portalCookiePaths,
  portalPathForRoom,
  parsePreviewCookie,
  previewCookieHeaders,
  previewCookieValue,
  previewRoleOf,
  safePortalPath,
} from './portal-preview-path';

const CLIENT = '4e7518a6-60e8-4017-85c7-7c3e0222c07a';

describe('portal preview paths', () => {
  it('opens the portal screen of the room section', () => {
    expect(portalPathForRoom(`/c/${CLIENT}/docs`)).toBe('/portal/docs');
    expect(portalPathForRoom(`/c/${CLIENT}/reports`)).toBe('/portal/docs');
    expect(portalPathForRoom(`/c/${CLIENT}/library`)).toBe('/portal/library');
    expect(portalPathForRoom(`/c/${CLIENT}/hub`)).toBe('/portal/hub');
    expect(portalPathForRoom(`/c/${CLIENT}/retainer`)).toBe('/portal/progress');
    expect(portalPathForRoom(`/c/${CLIENT}/outcome`)).toBe('/portal/progress');
    expect(portalPathForRoom(`/c/${CLIENT}/academy`)).toBe('/portal/academy');
  });

  it('falls back to the portal home for sections without a client screen', () => {
    expect(portalPathForRoom(`/c/${CLIENT}`)).toBe('/portal');
    expect(portalPathForRoom(`/c/${CLIENT}/tasks`)).toBe('/portal');
    expect(portalPathForRoom(`/c/${CLIENT}/agenda`)).toBe('/portal');
    expect(portalPathForRoom(`/c/${CLIENT}/unknown`)).toBe('/portal');
  });

  it('keeps the selected project on the room screen', () => {
    expect(portalPathForRoom(`/c/${CLIENT}/updates`, 'p-1')).toBe('/portal/updates?project=p-1');
    expect(portalPathForRoom(`/c/${CLIENT}/docs`, 'p-1')).toBe('/portal/docs');
  });

  it('scopes the cookie to the portal under every locale prefix', () => {
    expect(portalCookiePaths()).toEqual(['/portal', '/en/portal']);
    expect(localizedPath('en', '/portal/docs')).toBe('/en/portal/docs');
  });

  it('writes one cookie per portal path, so no locale loses the preview', () => {
    expect(previewCookieHeaders(CLIENT, { secure: true, maxAgeSeconds: 7200 })).toEqual([
      `portal_preview=${CLIENT}; Path=/portal; Max-Age=7200; HttpOnly; SameSite=Lax; Secure`,
      `portal_preview=${CLIENT}; Path=/en/portal; Max-Age=7200; HttpOnly; SameSite=Lax; Secure`,
    ]);
    expect(previewCookieHeaders('', { secure: false, maxAgeSeconds: 0 })[0]).toBe(
      'portal_preview=; Path=/portal; Max-Age=0; HttpOnly; SameSite=Lax',
    );
  });

  it('keeps the role in the cookie and falls back to the decision maker', () => {
    expect(parsePreviewCookie(previewCookieValue(CLIENT, 'client_finance'))).toEqual({
      clientId: CLIENT,
      role: 'client_finance',
    });
    expect(parsePreviewCookie(CLIENT)).toEqual({ clientId: CLIENT, role: 'decision_maker' });
    expect(parsePreviewCookie('not-a-client.operational')).toBeNull();
    expect(previewRoleOf('founder')).toBe('decision_maker');
  });

  it('opens only portal paths', () => {
    expect(safePortalPath('/portal/docs')).toBe('/portal/docs');
    expect(safePortalPath('/portal')).toBe('/portal');
    for (const path of ['/c/x', '//evil.com', '/portal/../c', 'https://x/portal', null]) {
      expect(safePortalPath(path)).toBeNull();
    }
  });
});
