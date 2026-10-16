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
  | 'proofs'
  | 'folder'
  | 'documents'
  | 'brand'
  | 'calendar'
  | 'wallet'
  | 'gauge'
  | 'chart';

export type NavigationLabelKey =
  | 'shell.studioNav.home'
  | 'shell.studioNav.pipeline'
  | 'shell.studioNav.applications'
  | 'shell.studioNav.acquisition'
  | 'shell.studioNav.updates'
  | 'shell.studioNav.tasks'
  | 'shell.studioNav.calendar'
  | 'shell.studioNav.money'
  | 'shell.studioNav.reports'
  | 'shell.settings'
  | 'shell.room.dashboard'
  | 'shell.room.updates'
  | 'shell.room.tasks'
  | 'shell.room.library'
  | 'shell.room.documents'
  | 'shell.room.brandHub'
  | 'shell.room.agenda'
  | 'shell.room.retainer'
  | 'shell.room.outcome'
  | 'shell.room.reports'
  | 'shell.allClients'
  | 'shell.portalNav.invoices'
  | 'shell.portalNav.approvals'
  | 'shell.portalNav.proofs'
  | 'shell.portalNav.updates'
  | 'shell.portalNav.library'
  | 'shell.portalNav.documents'
  | 'shell.portalNav.brandHub'
  | 'shell.portalNav.progress'
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
  | { level: 'studio'; permissions: { pipeline: boolean; money: boolean; reports?: boolean } }
  | { level: 'room'; clientId: string; retainer?: boolean; outcome?: boolean }
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
          { href: '/calendar', labelKey: 'shell.studioNav.calendar', icon: 'calendar' },
          ...(input.permissions.pipeline ? COMMERCIAL_ITEMS : []),
          ...(input.permissions.money
            ? [
                {
                  href: '/money',
                  labelKey: 'shell.studioNav.money' as const,
                  icon: 'wallet' as const,
                },
              ]
            : []),
          ...(input.permissions.reports
            ? [
                {
                  href: '/reports',
                  labelKey: 'shell.studioNav.reports' as const,
                  icon: 'chart' as const,
                },
              ]
            : []),
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
          {
            href: `/c/${input.clientId}/docs`,
            labelKey: 'shell.room.documents',
            icon: 'documents',
          },
          {
            href: `/c/${input.clientId}/library`,
            labelKey: 'shell.room.library',
            icon: 'folder',
          },
          {
            href: `/c/${input.clientId}/agenda`,
            labelKey: 'shell.room.agenda',
            icon: 'calendar',
          },
          {
            href: `/c/${input.clientId}/hub`,
            labelKey: 'shell.room.brandHub',
            icon: 'brand',
          },
          {
            href: `/c/${input.clientId}/reports`,
            labelKey: 'shell.room.reports',
            icon: 'chart',
          },
          ...(input.retainer
            ? [
                {
                  href: `/c/${input.clientId}/retainer`,
                  labelKey: 'shell.room.retainer' as const,
                  icon: 'gauge' as const,
                },
              ]
            : []),
          ...(input.outcome
            ? [
                {
                  href: `/c/${input.clientId}/outcome`,
                  labelKey: 'shell.room.outcome' as const,
                  icon: 'target' as const,
                },
              ]
            : []),
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
                { href: '/portal/docs', labelKey: 'shell.portalNav.documents', icon: 'documents' },
                { href: '/portal/library', labelKey: 'shell.portalNav.library', icon: 'folder' },
                { href: '/portal/hub', labelKey: 'shell.portalNav.brandHub', icon: 'brand' },
                { href: '/portal/progress', labelKey: 'shell.portalNav.progress', icon: 'gauge' },
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
