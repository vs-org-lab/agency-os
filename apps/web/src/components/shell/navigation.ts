export type NavigationIcon =
  'home' | 'settings' | 'dashboard' | 'kanban' | 'inbox' | 'target' | 'receipt' | 'feed';

export type NavigationLabelKey =
  | 'shell.studioNav.home'
  | 'shell.studioNav.pipeline'
  | 'shell.studioNav.applications'
  | 'shell.studioNav.acquisition'
  | 'shell.settings'
  | 'shell.room.dashboard'
  | 'shell.room.updates'
  | 'shell.allClients'
  | 'shell.portalNav.invoices';

export type NavigationCounter = 'unseenApplications';

export type NavigationItem = {
  href: string;
  labelKey: NavigationLabelKey;
  icon: NavigationIcon;
  counter?: NavigationCounter;
};

export type Navigation = {
  back: { href: string; labelKey: NavigationLabelKey } | null;
  items: NavigationItem[];
  footer: NavigationItem[];
};

export type NavigationLevel =
  | { level: 'studio'; permissions: { pipeline: boolean } }
  | { level: 'room'; clientId: string }
  | { level: 'portal'; permissions: { invoices: boolean } };

const COMMERCIAL_ITEMS: NavigationItem[] = [
  { href: '/pipeline', labelKey: 'shell.studioNav.pipeline', icon: 'kanban' },
  {
    href: '/applications',
    labelKey: 'shell.studioNav.applications',
    icon: 'inbox',
    counter: 'unseenApplications',
  },
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
        footer: [{ href: '/settings', labelKey: 'shell.settings', icon: 'settings' }],
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
          {
            href: `/c/${input.clientId}/updates`,
            labelKey: 'shell.room.updates',
            icon: 'feed',
          },
        ],
        footer: [{ href: '/settings', labelKey: 'shell.settings', icon: 'settings' }],
      };
    case 'portal':
      return {
        back: null,
        items: [
          { href: '/portal', labelKey: 'shell.studioNav.home', icon: 'home' },
          ...(input.permissions.invoices
            ? [
                {
                  href: '/portal/invoices',
                  labelKey: 'shell.portalNav.invoices',
                  icon: 'receipt',
                } as const,
              ]
            : []),
        ],
        footer: [
          { href: '/portal/settings/sessions', labelKey: 'shell.settings', icon: 'settings' },
        ],
      };
  }
}
