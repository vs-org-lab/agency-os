import { describe, expect, it } from 'vitest';
import { buildNavigation } from './navigation';

describe('buildNavigation', () => {
  it('room navigation lists tasks', () => {
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
    ]);
  });

  it('studio navigation lists updates and tasks', () => {
    const navigation = buildNavigation({ level: 'studio', permissions: { pipeline: false } });

    expect(navigation.back).toBeNull();
    expect(navigation.items.map((item) => item.href)).toEqual(['/', '/updates', '/tasks']);
    expect(navigation.footer.map((item) => item.href)).toEqual(['/settings']);
  });

  it('studio shows commercial items only with pipeline permission', () => {
    const navigation = buildNavigation({ level: 'studio', permissions: { pipeline: true } });

    expect(navigation.items.map((item) => [item.href, item.icon])).toEqual([
      ['/', 'home'],
      ['/updates', 'feed'],
      ['/tasks', 'tasks'],
      ['/pipeline', 'kanban'],
      ['/applications', 'inbox'],
      ['/acquisition', 'target'],
    ]);
  });

  it('applications carry the unseen applications counter', () => {
    const navigation = buildNavigation({ level: 'studio', permissions: { pipeline: true } });

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
      permissions: { invoices: false, room: false },
    });

    expect(navigation.items.map((item) => item.href)).toEqual(['/portal']);
    expect(navigation.footer.map((item) => item.href)).toEqual(['/portal/settings/sessions']);
  });

  it('portal level links invoices only for who pays', () => {
    const navigation = buildNavigation({
      level: 'portal',
      permissions: { invoices: true, room: false },
    });

    expect(navigation.items.map((item) => item.href)).toEqual(['/portal', '/portal/invoices']);
  });

  it('portal level links approvals and updates for room members', () => {
    const navigation = buildNavigation({
      level: 'portal',
      permissions: { invoices: false, room: true },
    });

    expect(navigation.items.map((item) => item.href)).toEqual([
      '/portal',
      '/portal/approvals',
      '/portal/updates',
    ]);
  });
});
