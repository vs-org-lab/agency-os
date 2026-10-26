// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { MotionProvider } from '@agency-os/ui/motion';
import type { ProjectView } from '@/modules/rooms';
import {
  chooseDay,
  chooseOption,
  installRadixDomPolyfills,
} from '../../../../../../test/radix-dom';
import { FinalApprovalCard } from './final-approval';
import { PlanView } from './plan-view';
import { ProcessBoard, type ProcessActions } from './process-board';
import { UpdateComposer, type PublishUpdate } from './update-composer';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeAll(installRadixDomPolyfills);

afterEach(() => {
  cleanup();
});

const PROJECT: ProjectView = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Website',
  status: 'active',
  startsOn: '2026-10-12',
  endsOn: '2026-11-20',
  dealId: null,
  finalApproval: null,
  deliveredAt: null,
  approvals: [],
  updates: [],
  phases: [
    {
      id: 'phase-1',
      position: 1,
      name: 'Descoberta e arquitetura',
      status: 'in_progress',
      requiresApproval: true,
      dueOn: '2026-10-30',
      startedAt: '2026-10-12T09:00:00.000Z',
      completedAt: null,
      codeOnStart: '2.3',
      codeOnDone: '2.4',
      steps: [
        {
          id: 'step-1',
          position: 1,
          name: 'Questionário de descoberta',
          status: 'in_progress',
          dueOn: null,
          reopened: false,
          visibleToClient: true,
          chained: false,
          shared: false,
          assigneeId: 'freelancer-1',
        },
      ],
    },
    {
      id: 'phase-2',
      position: 2,
      name: 'Produção',
      status: 'pending',
      requiresApproval: false,
      dueOn: '2026-11-20',
      startedAt: null,
      completedAt: null,
      codeOnStart: '2.5',
      codeOnDone: null,
      steps: [],
    },
  ],
};

function actionsMock(overrides: Partial<ProcessActions> = {}): ProcessActions {
  const ok = async () => ({ ok: true }) as const;
  return {
    startPhase: vi.fn(ok),
    completePhase: vi.fn(ok),
    requestApproval: vi.fn(ok),
    withdrawApproval: vi.fn(ok),
    updatePhase: vi.fn(ok),
    setStepStatus: vi.fn(ok),
    updateStep: vi.fn(ok),
    ...overrides,
  };
}

function withIntl(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <MotionProvider>{node}</MotionProvider>
    </NextIntlClientProvider>,
  );
}

describe('ProcessBoard', () => {
  it('start phase shows the refusal reason', async () => {
    withIntl(
      <ProcessBoard
        project={PROJECT}
        people={[]}
        writable
        currentUserId="founder-1"
        actions={actionsMock({
          startPhase: vi.fn(async () => ({ ok: false, code: 'previous_phase_open' }) as const),
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Produção/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Começar fase' }));
    });

    expect(screen.getByRole('alert').textContent).toBe(
      'A fase anterior ainda não está concluída (ou aprovada).',
    );
  });

  it('freelancer sees no phase actions but works on own steps', () => {
    withIntl(
      <ProcessBoard
        project={PROJECT}
        people={[]}
        writable={false}
        currentUserId="freelancer-1"
        actions={actionsMock()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Pedir aprovação' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Concluir fase' })).toBeNull();
    const done = screen.getByRole('button', {
      name: 'Marcar como feito: Questionário de descoberta',
    }) as HTMLButtonElement;
    expect(done.disabled).toBe(false);
    expect(screen.queryByLabelText('Responsável por Questionário de descoberta')).toBeNull();
  });

  it('freelancers get step and update controls on their project only', () => {
    withIntl(
      <ProcessBoard
        project={PROJECT}
        people={[]}
        writable={false}
        editable
        currentUserId="freelancer-2"
        actions={actionsMock()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Pedir aprovação' })).toBeNull();
    expect(
      (
        screen.getByRole('button', {
          name: 'Marcar como feito: Questionário de descoberta',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Questionário de descoberta' }));
    expect(screen.getByLabelText('Responsável por Questionário de descoberta')).toBeTruthy();
  });

  it('selects the phase in progress by default and lists its steps', () => {
    withIntl(
      <ProcessBoard
        project={PROJECT}
        people={[{ id: 'freelancer-1', name: 'Rui Costa' }]}
        writable
        currentUserId="founder-1"
        actions={actionsMock()}
      />,
    );

    const steps = screen.getByRole('list', { name: 'Passos de Descoberta e arquitetura' });
    expect(within(steps).getByText('Questionário de descoberta')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Pedir aprovação' })).toBeDefined();
  });
});

describe('ProcessBoard approvals and steps', () => {
  it('shows the client change request comment to the team', () => {
    withIntl(
      <ProcessBoard
        project={{
          ...PROJECT,
          approvals: [
            {
              id: 'approval-1',
              phaseId: 'phase-1',
              phaseName: 'Descoberta e arquitetura',
              status: 'changes_requested',
              requestedAt: '2026-10-14T10:00:00.000Z',
              decidedAt: '2026-10-15T10:00:00.000Z',
              comment: 'Falta a página de serviços.',
            },
          ],
        }}
        people={[]}
        writable
        currentUserId="founder-1"
        actions={actionsMock()}
      />,
    );

    expect(screen.getByText('Falta a página de serviços.')).toBeDefined();
    expect(screen.getByText(/^Alterações pedidas a/)).toBeDefined();
  });

  it('changes a step status only through an explicit button', async () => {
    const setStepStatus = vi.fn(async () => ({ ok: true }) as const);
    withIntl(
      <ProcessBoard
        project={PROJECT}
        people={[]}
        writable
        currentUserId="founder-1"
        actions={actionsMock({ setStepStatus })}
      />,
    );

    expect(screen.queryByRole('combobox', { name: /Estado do passo/ })).toBeNull();
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Marcar como feito: Questionário de descoberta' }),
      );
    });
    expect(setStepStatus).toHaveBeenCalledWith('step-1', 'done');
  });
});

describe('ProcessBoard controls submit the same data as before', () => {
  const PEOPLE = [
    { id: 'freelancer-1', name: 'Rui Costa' },
    { id: 'freelancer-2', name: 'Ana Dias' },
  ];

  function renderBoard(overrides: Partial<ProcessActions>) {
    const actions = actionsMock(overrides);
    withIntl(
      <ProcessBoard
        project={PROJECT}
        people={PEOPLE}
        writable
        currentUserId="founder-1"
        actions={actions}
      />,
    );
    return actions;
  }

  it('saves the phase date as an ISO date', async () => {
    const user = userEvent.setup();
    const updatePhase = vi.fn(async () => ({ ok: true }) as const);
    renderBoard({ updatePhase });

    await chooseDay(user, /^Data prevista da fase/, 15);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar data' }));
    });

    expect(updatePhase).toHaveBeenCalledWith('phase-1', '2026-10-15');
  });

  it('assigns and unassigns a step', async () => {
    const user = userEvent.setup();
    const updateStep = vi.fn(async () => ({ ok: true }) as const);
    renderBoard({ updateStep });
    await user.click(screen.getByRole('button', { name: 'Questionário de descoberta' }));
    const select = 'Responsável por Questionário de descoberta';

    await chooseOption(user, select, 'Ana Dias');
    expect(updateStep).toHaveBeenLastCalledWith({ stepId: 'step-1', assigneeId: 'freelancer-2' });

    await chooseOption(user, select, 'Sem responsável');
    expect(updateStep).toHaveBeenLastCalledWith({ stepId: 'step-1', assigneeId: null });
  });

  it('sets a step date as an ISO date', async () => {
    const user = userEvent.setup();
    const updateStep = vi.fn(async () => ({ ok: true }) as const);
    renderBoard({ updateStep });

    await user.click(screen.getByRole('button', { name: 'Questionário de descoberta' }));
    await chooseDay(user, /^Data de Questionário de descoberta/, 12);

    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    expect(updateStep).toHaveBeenCalledWith({
      stepId: 'step-1',
      dueOn: `${now.getFullYear()}-${month}-12`,
    });
  });
});

describe('PlanView', () => {
  it('plan view lists weeks', () => {
    withIntl(<PlanView phases={PROJECT.phases} startsOn={PROJECT.startsOn} />);

    expect(screen.getByText('Semanas 1 a 3')).toBeDefined();
    expect(screen.getByText('Semanas 3 a 6')).toBeDefined();
  });
});

describe('UpdateComposer', () => {
  it('update composer defaults to internal and keeps the text when refused', async () => {
    const publish = vi.fn<PublishUpdate>(async () => ({ ok: false, code: 'invalid_input' }));
    withIntl(<UpdateComposer projectId={PROJECT.id} publish={publish} />);

    expect((screen.getByLabelText('Interna') as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByLabelText('Texto'), { target: { value: 'Mapa pronto' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    });

    expect(publish).toHaveBeenCalledWith({
      projectId: PROJECT.id,
      body: 'Mapa pronto',
      milestone: null,
      visibility: 'internal',
      fileIds: [],
    });
    expect((screen.getByLabelText('Texto') as HTMLTextAreaElement).value).toBe('Mapa pronto');
    expect(screen.getByRole('alert').textContent).toBe('Confirme os campos.');
  });
});

describe('FinalApprovalCard', () => {
  const done = PROJECT.phases.map((phase) => ({ ...phase, status: 'done' as const }));

  it('the plan offers the final approval when every phase is done', async () => {
    const request = vi.fn(async () => ({ ok: true }) as const);
    withIntl(
      <FinalApprovalCard
        project={{ ...PROJECT, status: 'completed', phases: done }}
        writable
        request={request}
        withdraw={vi.fn(async () => ({ ok: true }) as const)}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pedir aprovação final' }));
    });
    expect(request).toHaveBeenCalledWith(PROJECT.id);
    expect(screen.getByText('Pedido de aprovação final enviado ao cliente.')).toBeTruthy();
  });

  it('shows the pending request and the changes the client asked for', () => {
    withIntl(
      <FinalApprovalCard
        project={{
          ...PROJECT,
          status: 'completed',
          phases: done,
          finalApproval: { id: 'final-1', status: 'changes_requested', comment: 'Falta o rodapé' },
        }}
        writable
        request={vi.fn(async () => ({ ok: true }) as const)}
        withdraw={vi.fn(async () => ({ ok: true }) as const)}
      />,
    );

    expect(screen.getByText('Falta o rodapé')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pedir aprovação final' })).toBeTruthy();
  });

  it('a delivered project shows its date', () => {
    withIntl(
      <FinalApprovalCard
        project={{
          ...PROJECT,
          status: 'delivered',
          phases: done,
          deliveredAt: '2026-10-12T09:00:00.000Z',
          finalApproval: { id: 'final-1', status: 'approved', comment: null },
        }}
        writable
        request={vi.fn(async () => ({ ok: true }) as const)}
        withdraw={vi.fn(async () => ({ ok: true }) as const)}
      />,
    );

    expect(screen.getByText('Projeto entregue a 12 de outubro de 2026.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows nothing while phases are open', () => {
    withIntl(
      <FinalApprovalCard
        project={PROJECT}
        writable
        request={vi.fn(async () => ({ ok: true }) as const)}
        withdraw={vi.fn(async () => ({ ok: true }) as const)}
      />,
    );

    expect(screen.queryByRole('region', { name: 'Entrega final' })).toBeNull();
  });
});
