// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MotionProvider } from '@agency-os/ui/motion';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { PortalRetainerView } from '@/modules/retainers';
import type { ClientPendingApproval } from '@/modules/rooms';
import { portalActionItems } from './action-items';
import { PortalHome } from './portal-home';

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/portal',
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

afterEach(cleanup);

const VIEW: PortalRetainerView = {
  decides: true,
  suspended: false,
  month: '2026-10-01',
  period: { day: 26, total: 31, left: 5 },
  retainer: { id: 'retainer-1', tier: 'Essencial', status: 'active' },
  limits: [
    {
      kind: 'content_pieces',
      limit: 4,
      carry: 0,
      available: 4,
      used: 1,
      remaining: 3,
      percent: 25,
    },
  ],
  extraRequests: [],
};

const request = vi.fn(async () => ({ ok: true as const, outcome: 'task' as const }));

function home(props: Partial<React.ComponentProps<typeof PortalHome>> = {}) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <MotionProvider>
        <PortalHome
          client={{ id: 'client-1', name: 'Casa Azul' }}
          contactName="Maria Santos"
          now="2026-10-26T10:00:00.000Z"
          actions={[]}
          retainer={null}
          project={null}
          {...props}
        />
      </MotionProvider>
    </NextIntlClientProvider>,
  );
}

describe('PortalHome', () => {
  it('client with retainer sees rings, board and request button', () => {
    home({
      retainer: {
        view: VIEW,
        requests: [
          {
            id: 'r1',
            description: 'Cartaz do evento',
            state: 'received',
            createdAt: '2026-10-20T10:00:00.000Z',
            completedAt: null,
          },
        ],
        request,
      },
    });

    expect(screen.getByRole('heading', { name: 'Olá, Maria Santos' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Peças de conteúdo' })).toBeTruthy();
    expect(screen.getByRole('region', { name: /^Recebido/ })).toBeTruthy();
    expect(screen.getByText('Cartaz do evento')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Pedir trabalho/ })).toBeTruthy();
  });

  it('client without room access sees no board, no rings and nothing waiting', () => {
    home();

    expect(screen.queryByRole('group', { name: 'Peças de conteúdo' })).toBeNull();
    expect(screen.queryByRole('region', { name: /^Recebido/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Pedir trabalho/ })).toBeNull();
    expect(screen.getByText('Está tudo em dia. Avisamos quando precisarmos de si.')).toBeTruthy();
  });

  it('pending approval appears in a sua ação with its link', () => {
    const approvals: ClientPendingApproval[] = [
      {
        id: 'a1',
        kind: 'phase',
        projectId: 'p1',
        projectName: 'Website',
        subjectName: 'Fase de design',
        versionId: null,
        documentId: null,
        requestedAt: '2026-10-25T10:00:00.000Z',
      },
    ];
    const actions = portalActionItems({
      decides: true,
      approvals,
      proposal: null,
      invoices: [],
    });

    home({ actions });

    expect(screen.getByText('A sua vez')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Decidir' }).getAttribute('href')).toBe(
      '/portal/approvals',
    );
    expect(screen.getByText('Fase de design')).toBeTruthy();
  });

  it('operational users are not asked to decide approvals', () => {
    const actions = portalActionItems({
      decides: false,
      approvals: [
        {
          id: 'a1',
          kind: 'file',
          projectId: 'p1',
          projectName: 'Website',
          subjectName: 'Cartaz',
          versionId: 'v1',
          documentId: null,
          requestedAt: '2026-10-25T10:00:00.000Z',
        },
      ],
      proposal: null,
      invoices: [],
    });

    expect(actions).toEqual([]);
  });
});
