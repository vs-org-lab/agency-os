// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { ClientRoom } from '@/components/rooms/client-room';
import type { ClientProjectView } from '@/modules/rooms';
import { ApprovalDecision, type DecideApproval } from '@/components/rooms/approval-decision';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
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
}));

afterEach(() => {
  cleanup();
});

const PROJECT: ClientProjectView = {
  id: 'project-1',
  name: 'Website',
  status: 'active',
  startsOn: '2026-10-12',
  endsOn: null,
  phases: [
    {
      id: 'phase-1',
      position: 1,
      name: 'Descoberta e arquitetura',
      status: 'awaiting_approval',
      requiresApproval: true,
      dueOn: null,
      startedAt: '2026-10-12T09:00:00.000Z',
      completedAt: null,
      steps: [
        {
          id: 'step-1',
          position: 1,
          name: 'Questionário de descoberta',
          status: 'done',
          dueOn: null,
          reopened: false,
        },
        {
          id: 'step-3',
          position: 3,
          name: 'Arquitetura e mapa de conteúdos',
          status: 'in_progress',
          dueOn: null,
          reopened: false,
        },
      ],
    },
    {
      id: 'phase-2',
      position: 2,
      name: 'Produção',
      status: 'pending',
      requiresApproval: false,
      dueOn: null,
      startedAt: null,
      completedAt: null,
      steps: [],
    },
  ],
  updates: [
    {
      id: 'update-1',
      kind: 'manual',
      body: 'Mapa pronto para revisão',
      milestone: null,
      authorName: 'Vladimir Silva',
      createdAt: '2026-10-14T10:00:00.000Z',
      files: [],
    },
  ],
  approvals: [
    {
      id: 'approval-1',
      phaseId: 'phase-1',
      phaseName: 'Descoberta e arquitetura',
      status: 'pending',
      requestedAt: '2026-10-14T10:00:00.000Z',
      decidedAt: null,
      comment: null,
    },
  ],
};

function withIntl(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      {node}
    </NextIntlClientProvider>,
  );
}

describe('portal room', () => {
  it('approving keeps the confirmation on screen', async () => {
    const decide: DecideApproval = vi.fn(async () => ({ ok: true as const }));
    withIntl(<ApprovalDecision approvalId="approval-1" decide={decide} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
    });

    expect(screen.getByText('Decisão registada. Obrigado.')).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('change request button stays disabled without a comment', async () => {
    const decide = vi.fn<DecideApproval>(async () => ({ ok: true }));
    withIntl(<ApprovalDecision approvalId="approval-1" decide={decide} />);

    const request = screen.getByRole('button', { name: 'Pedir alterações' }) as HTMLButtonElement;
    expect(request.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('O que deve mudar'), {
      target: { value: 'Falta a página de serviços.' },
    });
    expect(request.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(request);
    });
    expect(decide).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      decision: 'changes_requested',
      comment: 'Falta a página de serviços.',
    });
  });

  it('operational sees updates and approvals but no approve button', () => {
    withIntl(<ClientRoom project={PROJECT} />);

    expect(screen.getByText('Mapa pronto para revisão')).toBeDefined();
    expect(screen.getAllByText('Descoberta e arquitetura').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
    expect(screen.getByText(/^À espera da sua decisão desde/)).toBeDefined();
  });
});
