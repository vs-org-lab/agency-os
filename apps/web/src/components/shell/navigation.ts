export type NavigationIcon =
  | 'home'
  | 'settings'
  | 'dashboard'
  | 'kanban'
  | 'inbox'
  | 'target'
  | 'receipt'
  | 'feed'
  | 'check'
  | 'tasks'
  | 'users'
  | 'proofs';

export type NavigationLabelKey =
  | 'shell.studioNav.home'
  | 'shell.studioNav.pipeline'
  | 'shell.studioNav.applications'
  | 'shell.studioNav.acquisition'
  | 'shell.studioNav.updates'
  | 'shell.studioNav.tasks'
  | 'shell.settings'
  | 'shell.room.dashboard'
  | 'shell.room.updates'
  | 'shell.room.tasks'
  | 'shell.allClients'
  | 'shell.portalNav.invoices'
  | 'shell.portalNav.approvals'
  | 'shell.portalNav.proofs'
  | 'shell.portalNav.updates'
  | 'shell.portalNav.team';

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
  | { level: 'portal'; permissions: { invoices: boolean; room: boolean; team: boolean } };

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
          { href: '/updates', labelKey: 'shell.studioNav.updates', icon: 'feed' },
          { href: '/tasks', labelKey: 'shell.studioNav.tasks', icon: 'tasks' },
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
          {
            href: `/c/${input.clientId}/tasks`,
            labelKey: 'shell.room.tasks',
            icon: 'tasks',
          },
        ],
        footer: [{ href: '/settings', labelKey: 'shell.settings', icon: 'settings' }],
      };
    case 'portal':
      return {
        back: null,
        items: [
          { href: '/portal', labelKey: 'shell.studioNav.home', icon: 'home' },
          ...(input.permissions.room
            ? ([
                { href: '/portal/approvals', labelKey: 'shell.portalNav.approvals', icon: 'check' },
                { href: '/portal/proofs', labelKey: 'shell.portalNav.proofs', icon: 'proofs' },
                { href: '/portal/updates', labelKey: 'shell.portalNav.updates', icon: 'feed' },
              ] as const)
            : []),
          ...(input.permissions.invoices
            ? [
                {
                  href: '/portal/invoices',
                  labelKey: 'shell.portalNav.invoices',
                  icon: 'receipt',
                } as const,
              ]
            : []),
          ...(input.permissions.team
            ? [
                {
                  href: '/portal/settings/team',
                  labelKey: 'shell.portalNav.team',
                  icon: 'users',
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
