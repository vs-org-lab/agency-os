import { describe, expect, it } from 'vitest';
import { buildNavigation } from './navigation';

describe('buildNavigation', () => {
  it('room level sidebar shows back to all clients link', () => {
    const navigation = buildNavigation({ level: 'room', clientId: 'client-1' });

    expect(navigation.back).toEqual({ href: '/', labelKey: 'shell.allClients' });
    expect(navigation.items[0]).toMatchObject({
      href: '/c/client-1',
      labelKey: 'shell.room.dashboard',
    });
  });

  it('studio level has no back link and links home and settings', () => {
    const navigation = buildNavigation({ level: 'studio', permissions: { pipeline: false } });

    expect(navigation.back).toBeNull();
    expect(navigation.items.map((item) => item.href)).toEqual(['/']);
    expect(navigation.footer.map((item) => item.href)).toEqual(['/settings/sessions']);
  });

  it('studio shows commercial items only with pipeline permission', () => {
    const navigation = buildNavigation({ level: 'studio', permissions: { pipeline: true } });

    expect(navigation.items.map((item) => [item.href, item.icon])).toEqual([
      ['/', 'home'],
      ['/pipeline', 'kanban'],
      ['/applications', 'inbox'],
      ['/acquisition', 'target'],
    ]);
  });

  it('portal level links portal home and settings', () => {
    const navigation = buildNavigation({ level: 'portal' });

    expect(navigation.items.map((item) => item.href)).toEqual(['/portal']);
    expect(navigation.footer.map((item) => item.href)).toEqual(['/portal/settings/sessions']);
  });
});
