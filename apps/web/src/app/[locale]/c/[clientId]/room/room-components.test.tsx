// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { ProjectView } from '@/modules/rooms';
import { PlanView } from './plan-view';
import { ProcessBoard, type ProcessActions } from './process-board';
import { UpdateComposer, type PublishUpdate } from './update-composer';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

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
      {node}
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
    const status = screen.getByLabelText(
      'Estado do passo Questionário de descoberta',
    ) as HTMLSelectElement;
    expect(status.disabled).toBe(false);
    expect(screen.queryByLabelText('Responsável por Questionário de descoberta')).toBeNull();
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
    });
    expect((screen.getByLabelText('Texto') as HTMLTextAreaElement).value).toBe('Mapa pronto');
    expect(screen.getByRole('alert').textContent).toBe('Confirme os campos.');
  });
});
