// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { MemberView, TeamMemberView } from '@/modules/team';
import { AssignmentList } from './assignment-list';
import { ColleagueList } from './colleague-list';
import { InviteForm } from './invite-form';
import { MemberForm } from './member-form';
import { TeamTable } from './team-table';

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

function renderWithIntl(node: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      {node}
    </NextIntlClientProvider>,
  );
}

const OK = async () => ({ ok: true as const });

const FREELANCER: TeamMemberView = {
  userId: '2d7a9b32-3e3c-4c0a-9c77-4b8c2d3e4f50',
  membershipId: '4f9c1d54-5a5e-4e2c-9e99-6d0e4f506172',
  name: 'Rui Costa',
  email: 'rui@estudio.pt',
  role: 'freelancer',
  status: 'active',
  clientCount: 1,
  load: { tasksThisWeek: 2, activeProjects: 1 },
  rates: { hourlyCost: '35.00', currency: 'EUR', weeklyHours: 20 },
};

const INVITED: TeamMemberView = {
  ...FREELANCER,
  userId: '3e8b0c43-4f4d-4d1b-8d88-5c9d3e4f5061',
  membershipId: '5a0d2e65-6b6f-4f3d-8faa-7e1f50617283',
  name: 'Rita Gestora',
  email: 'rita@estudio.pt',
  role: 'project_manager',
  status: 'invited',
  clientCount: 0,
  load: { tasksThisWeek: 0, activeProjects: 0 },
  rates: null,
};

function member(overrides: Partial<MemberView>): MemberView {
  return {
    ...FREELANCER,
    clients: [
      { id: 'client-a', name: 'Atlas Lda', assigned: true },
      { id: 'client-b', name: 'Boreal SA', assigned: false },
    ],
    projects: [
      {
        id: 'project-1',
        name: 'Website',
        clientId: 'client-a',
        clientName: 'Atlas Lda',
        assigned: true,
      },
    ],
    ...overrides,
  };
}

describe('team components', () => {
  it('team table shows status, load and rates', async () => {
    const resend = vi.fn(OK);
    renderWithIntl(<TeamTable members={[FREELANCER, INVITED]} resend={resend} />);

    expect(screen.getByText('Ativo')).toBeTruthy();
    expect(screen.getByText('Convidado')).toBeTruthy();
    expect(screen.getByText('2 tarefas esta semana · 1 projeto')).toBeTruthy();
    expect(screen.getByText('20 h por semana')).toBeTruthy();
    expect(screen.getByText(/35,00\s€\/h/)).toBeTruthy();
    expect(screen.getByText('Sem custo definido')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Rui Costa' }).getAttribute('href')).toBe(
      `/settings/team/${FREELANCER.userId}`,
    );
    expect(screen.queryByRole('button', { name: 'Reenviar o convite a Rui Costa' })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reenviar o convite a Rita Gestora' }));
    });
    expect(resend).toHaveBeenCalledWith(INVITED.membershipId);
  });

  it('invite form keeps values when refused', async () => {
    const invite = vi.fn(async () => ({ ok: false as const, code: 'invalid_input' }));
    renderWithIntl(
      <InviteForm
        idPrefix="team"
        roles={['project_manager', 'freelancer', 'finance']}
        invite={invite}
      />,
    );

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Rui Costa' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rui@estudio.pt' } });
    fireEvent.change(screen.getByLabelText('Papel'), { target: { value: 'freelancer' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar convite' }));
    });

    expect(invite).toHaveBeenCalledWith({
      fullName: 'Rui Costa',
      email: 'rui@estudio.pt',
      role: 'freelancer',
    });
    expect(screen.getByText('Verifique os campos e tente de novo.')).toBeTruthy();
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('rui@estudio.pt');
  });

  it('member form hides project assignments for managers', async () => {
    const setClient = vi.fn(OK);
    renderWithIntl(
      <AssignmentList
        member={member({ role: 'project_manager' })}
        setClient={setClient}
        setProject={OK}
      />,
    );

    expect(screen.getByText('Clientes atribuídos')).toBeTruthy();
    expect(screen.queryByText('Projetos atribuídos')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Boreal SA' }));
    });
    expect(setClient).toHaveBeenCalledWith(FREELANCER.userId, 'client-b', true);

    cleanup();
    renderWithIntl(<AssignmentList member={member({})} setClient={OK} setProject={OK} />);
    expect(screen.getByText('Projetos atribuídos')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Website · Atlas Lda' })).toBeTruthy();
  });

  it('member form changes the role, saves rates and revokes access', async () => {
    const changeRole = vi.fn(OK);
    const saveRates = vi.fn(OK);
    const revoke = vi.fn(OK);
    renderWithIntl(
      <MemberForm
        member={member({})}
        changeRole={changeRole}
        revoke={revoke}
        restore={OK}
        saveRates={saveRates}
      />,
    );

    fireEvent.change(screen.getByLabelText('Papel'), { target: { value: 'project_manager' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mudar papel' }));
    });
    expect(changeRole).toHaveBeenCalledWith(FREELANCER.userId, 'project_manager');

    fireEvent.change(screen.getByLabelText('Custo por hora'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Horas por semana'), { target: { value: '30' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    });
    expect(saveRates).toHaveBeenCalledWith(FREELANCER.userId, {
      hourlyCost: '40',
      currency: 'EUR',
      weeklyHours: 30,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retirar acesso' }));
    });
    expect(revoke).toHaveBeenCalledWith(FREELANCER.userId);
    expect(screen.queryByRole('button', { name: 'Repor acesso' })).toBeNull();
  });

  it('colleague list hides actions on self', () => {
    renderWithIntl(
      <ColleagueList
        colleagues={[
          {
            membershipId: 'm-1',
            name: 'Marta Lopes',
            email: 'marta@atlas.pt',
            role: 'decision_maker',
            status: 'active',
            isSelf: true,
          },
          {
            membershipId: 'm-2',
            name: 'Paulo Reis',
            email: 'paulo@atlas.pt',
            role: 'operational',
            status: 'invited',
            isSelf: false,
          },
        ]}
        changeRole={OK}
        revoke={OK}
      />,
    );

    expect(screen.getByText('Você')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retirar o acesso de Marta Lopes' })).toBeNull();
    expect(screen.queryByLabelText('Papel de Marta Lopes')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retirar o acesso de Paulo Reis' })).toBeTruthy();
    expect(screen.getByLabelText('Papel de Paulo Reis')).toBeTruthy();
  });
});
