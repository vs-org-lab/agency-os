export type NavigationIcon = 'home' | 'settings' | 'dashboard' | 'kanban' | 'inbox' | 'target';

export type NavigationLabelKey =
  | 'shell.studioNav.home'
  | 'shell.studioNav.pipeline'
  | 'shell.studioNav.applications'
  | 'shell.studioNav.acquisition'
  | 'shell.settings'
  | 'shell.room.dashboard'
  | 'shell.allClients';

export type NavigationItem = {
  href: string;
  labelKey: NavigationLabelKey;
  icon: NavigationIcon;
};

export type Navigation = {
  back: { href: string; labelKey: NavigationLabelKey } | null;
  items: NavigationItem[];
  footer: NavigationItem[];
};

export type NavigationLevel =
  | { level: 'studio'; permissions: { pipeline: boolean } }
  | { level: 'room'; clientId: string }
  | { level: 'portal' };

const COMMERCIAL_ITEMS: NavigationItem[] = [
  { href: '/pipeline', labelKey: 'shell.studioNav.pipeline', icon: 'kanban' },
  { href: '/applications', labelKey: 'shell.studioNav.applications', icon: 'inbox' },
  { href: '/acquisition', labelKey: 'shell.studioNav.acquisition', icon: 'target' },
];

export function buildNavigation(input: NavigationLevel): Navigation {
  switch (input.level) {
    case 'studio':
      return {
        back: null,
        items: [
          { href: '/', labelKey: 'shell.studioNav.home', icon: 'home' },
          ...(input.permissions.pipeline ? COMMERCIAL_ITEMS : []),
        ],
        footer: [{ href: '/settings/sessions', labelKey: 'shell.settings', icon: 'settings' }],
      };
    case 'room':
      return {
        back: { href: '/', labelKey: 'shell.allClients' },
        items: [
          {
            href: `/c/${input.clientId}`,
            labelKey: 'shell.room.dashboard',
            icon: 'dashboard',
          },
        ],
        footer: [{ href: '/settings/sessions', labelKey: 'shell.settings', icon: 'settings' }],
      };
    case 'portal':
      return {
        back: null,
        items: [{ href: '/portal', labelKey: 'shell.studioNav.home', icon: 'home' }],
        footer: [
          { href: '/portal/settings/sessions', labelKey: 'shell.settings', icon: 'settings' },
        ],
      };
  }
}
