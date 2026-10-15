import { describe, expect, it } from 'vitest';
import { buildNavigation } from './navigation';

describe('buildNavigation', () => {
  it('room and portal navigation link documents, the library and the brand hub', () => {
    const navigation = buildNavigation({ level: 'room', clientId: 'client-1' });

    expect(navigation.back).toEqual({ href: '/', labelKey: 'shell.allClients' });
    expect(navigation.items[0]).toMatchObject({
      href: '/c/client-1',
      labelKey: 'shell.room.dashboard',
    });
    expect(navigation.items.map((item) => item.href)).toEqual([
      '/c/client-1',
      '/c/client-1/updates',
      '/c/client-1/tasks',
      '/c/client-1/docs',
      '/c/client-1/library',
      '/c/client-1/agenda',
      '/c/client-1/hub',
    ]);
    expect(navigation.items.at(-1)).toMatchObject({
      labelKey: 'shell.room.brandHub',
      icon: 'brand',
    });
  });

  it('the room shows Retainer only when there is one', () => {
    expect(
      buildNavigation({ level: 'room', clientId: 'client-1' }).items.some(
        (item) => item.href === '/c/client-1/retainer',
      ),
    ).toBe(false);
    const navigation = buildNavigation({ level: 'room', clientId: 'client-1', retainer: true });
    expect(navigation.items.at(-1)).toEqual({
      href: '/c/client-1/retainer',
      labelKey: 'shell.room.retainer',
      icon: 'gauge',
    });
  });

  it('room navigation links the outcome when it exists or for writers', () => {
    expect(
      buildNavigation({ level: 'room', clientId: 'client-1', retainer: true }).items.some(
        (item) => item.href === '/c/client-1/outcome',
      ),
    ).toBe(false);
    const navigation = buildNavigation({
      level: 'room',
      clientId: 'client-1',
      retainer: true,
      outcome: true,
    });
    expect(navigation.items.slice(-2)).toEqual([
      { href: '/c/client-1/retainer', labelKey: 'shell.room.retainer', icon: 'gauge' },
      { href: '/c/client-1/outcome', labelKey: 'shell.room.outcome', icon: 'target' },
    ]);
  });

  it('studio navigation lists updates and tasks', () => {
    const navigation = buildNavigation({
      level: 'studio',
      permissions: { pipeline: false, money: false },
    });

    expect(navigation.back).toBeNull();
    expect(navigation.items.map((item) => item.href)).toEqual([
      '/',
      '/updates',
      '/tasks',
      '/calendar',
    ]);
    expect(navigation.footer.map((item) => item.href)).toEqual(['/settings']);
  });

  it('studio shows commercial items only with pipeline permission', () => {
    const navigation = buildNavigation({
      level: 'studio',
      permissions: { pipeline: true, money: false },
    });

    expect(navigation.items.map((item) => [item.href, item.icon])).toEqual([
      ['/', 'home'],
      ['/updates', 'feed'],
      ['/tasks', 'tasks'],
      ['/calendar', 'calendar'],
      ['/pipeline', 'kanban'],
      ['/applications', 'inbox'],
      ['/acquisition', 'target'],
    ]);
  });

  it('studio shows money after the commercial items for billing readers', () => {
    const navigation = buildNavigation({
      level: 'studio',
      permissions: { pipeline: true, money: true },
    });
    expect(navigation.items.slice(-2).map((item) => [item.href, item.labelKey, item.icon])).toEqual(
      [
        ['/acquisition', 'shell.studioNav.acquisition', 'target'],
        ['/money', 'shell.studioNav.money', 'wallet'],
      ],
    );
    const finance = buildNavigation({
      level: 'studio',
      permissions: { pipeline: false, money: true },
    });
    expect(finance.items.map((item) => item.href)).toContain('/money');
  });

  it('applications carry the unseen applications counter', () => {
    const navigation = buildNavigation({
      level: 'studio',
      permissions: { pipeline: true, money: false },
    });

    expect(navigation.items.filter((item) => item.counter).map((item) => item.href)).toEqual([
      '/applications',
    ]);
    expect(navigation.items.find((item) => item.href === '/applications')?.counter).toBe(
      'unseenApplications',
    );
  });

  it('portal level links portal home and settings', () => {
    const navigation = buildNavigation({
      level: 'portal',
      permissions: { invoices: false, room: false, team: false },
    });

    expect(navigation.items.map((item) => item.href)).toEqual(['/portal']);
    expect(navigation.footer.map((item) => item.href)).toEqual(['/portal/settings/sessions']);
  });

  it('portal level links invoices only for who pays', () => {
    const navigation = buildNavigation({
      level: 'portal',
      permissions: { invoices: true, room: false, team: false },
    });

    expect(navigation.items.map((item) => item.href)).toEqual(['/portal', '/portal/invoices']);
  });

  it('portal navigation links the library for room members', () => {
    const navigation = buildNavigation({
      level: 'portal',
      permissions: { invoices: false, room: true, team: false },
    });

    expect(navigation.items.map((item) => item.href)).toEqual([
      '/portal',
      '/portal/approvals',
      '/portal/proofs',
      '/portal/updates',
      '/portal/docs',
      '/portal/library',
      '/portal/hub',
      '/portal/progress',
    ]);
  });

  it('portal level links colleagues for decision makers', () => {
    const navigation = buildNavigation({
      level: 'portal',
      permissions: { invoices: true, room: true, team: true },
    });

    expect(navigation.items.map((item) => [item.href, item.icon])).toContainEqual([
      '/portal/settings/team',
      'users',
    ]);
  });
});
