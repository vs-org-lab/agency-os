// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { MotionProvider } from '@agency-os/ui/motion';
import type { ProjectView, StepView } from '@/modules/rooms';
import { installRadixDomPolyfills } from '../../../../../../test/radix-dom';
import { ProcessBoard, type ProcessActions } from './process-board';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeAll(installRadixDomPolyfills);

afterEach(() => {
  cleanup();
});

function step(overrides: Partial<StepView>): StepView {
  return {
    id: 'step-1',
    position: 1,
    name: 'Questionário de descoberta',
    status: 'in_progress',
    dueOn: null,
    reopened: false,
    visibleToClient: false,
    chained: false,
    shared: false,
    assigneeId: null,
    ...overrides,
  };
}

function projectWith(steps: StepView[]): ProjectView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Website',
    status: 'active',
    startsOn: '2026-10-12',
    endsOn: null,
    dealId: null,
    finalApproval: null,
    deliveredAt: null,
    approvals: [],
    updates: [],
    phases: [
      {
        id: 'phase-1',
        position: 1,
        name: 'Descoberta',
        status: 'in_progress',
        requiresApproval: false,
        dueOn: null,
        startedAt: '2026-10-12T09:00:00.000Z',
        completedAt: null,
        codeOnStart: null,
        codeOnDone: null,
        steps,
      },
    ],
  };
}

function board(project: ProjectView, setStepStatus = vi.fn(async () => ({ ok: true }) as const)) {
  const ok = async () => ({ ok: true }) as const;
  const actions: ProcessActions = {
    startPhase: vi.fn(ok),
    completePhase: vi.fn(ok),
    requestApproval: vi.fn(ok),
    withdrawApproval: vi.fn(ok),
    updatePhase: vi.fn(ok),
    setStepStatus,
    updateStep: vi.fn(ok),
  };
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <MotionProvider>
        <ProcessBoard
          project={project}
          people={[{ id: 'p-1', name: 'Rui Costa' }]}
          writable
          currentUserId="founder-1"
          actions={actions}
        />
      </MotionProvider>
    </NextIntlClientProvider>,
  );
  return actions;
}

describe('ProcessBoard compact steps', () => {
  it('toggles a step done from the circle', async () => {
    const setStepStatus = vi.fn(async () => ({ ok: true }) as const);
    board(projectWith([step({})]), setStepStatus);

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Marcar como feito: Questionário de descoberta' }),
      );
    });

    expect(setStepStatus).toHaveBeenCalledWith('step-1', 'done');
  });

  it('asks to confirm before reopening a step already shared', async () => {
    const setStepStatus = vi.fn(async () => ({ ok: true }) as const);
    board(projectWith([step({ status: 'done', shared: true })]), setStepStatus);

    fireEvent.click(screen.getByRole('button', { name: 'Reabrir: Questionário de descoberta' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(setStepStatus).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Reabrir passo' }));
    });
    expect(setStepStatus).toHaveBeenCalledWith('step-1', 'in_progress');
  });

  it('cancel keeps the step unchanged', async () => {
    const setStepStatus = vi.fn(async () => ({ ok: true }) as const);
    board(projectWith([step({ status: 'done', shared: true })]), setStepStatus);

    fireEvent.click(screen.getByRole('button', { name: 'Reabrir: Questionário de descoberta' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(setStepStatus).not.toHaveBeenCalled();
  });

  it('reopens a step never shared without asking', async () => {
    const setStepStatus = vi.fn(async () => ({ ok: true }) as const);
    board(projectWith([step({ status: 'done', shared: false })]), setStepStatus);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reabrir: Questionário de descoberta' }));
    });

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(setStepStatus).toHaveBeenCalledWith('step-1', 'in_progress');
  });

  it('opens the side panel from the step name', async () => {
    const user = userEvent.setup();
    board(projectWith([step({})]));

    expect(screen.queryByLabelText('Responsável por Questionário de descoberta')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Questionário de descoberta' }));

    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByLabelText('Responsável por Questionário de descoberta')).toBeTruthy();
  });
});
