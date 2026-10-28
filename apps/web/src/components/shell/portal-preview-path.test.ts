import { describe, expect, it } from 'vitest';
import { localizedPortalPath, portalCookiePaths, portalPathForRoom } from './portal-preview-path';

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
    expect(localizedPortalPath('en', '/portal/docs')).toBe('/en/portal/docs');
  });
});
