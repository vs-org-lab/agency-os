// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { ClientReportsView, ClientReportView } from '@/modules/client-reports';
import { ReportEditor } from './report-editor';
import { ReportsList } from './reports-list';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push, refresh }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function wrap(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      {node}
    </NextIntlClientProvider>,
  );
}

const LIST: ClientReportsView = {
  canWrite: true,
  reports: [
    {
      id: 'r1',
      kind: 'qbr',
      periodStart: '2026-07-01',
      periodEnd: '2026-09-30',
      title: 'QBR — T3 2026',
      status: 'shared',
      sharedAt: new Date('2026-10-05T10:00:00Z'),
    },
    {
      id: 'r2',
      kind: 'monthly',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      title: 'Relatório mensal — setembro 2026',
      status: 'draft',
      sharedAt: null,
    },
  ],
  periods: { monthly: ['2026-09-01', '2026-08-01'], qbr: ['2026-07-01', '2026-04-01'] },
};

const REPORT: ClientReportView = {
  id: 'r2',
  clientId: 'c1',
  period: { kind: 'monthly', start: '2026-09-01', end: '2026-09-30' },
  title: 'Relatório mensal — setembro 2026',
  status: 'draft',
  sharedAt: null,
  documentId: null,
  texts: { summary: 'Um mês de entregas.', highlights: '', nextSteps: '', priorities: '' },
  data: {
    steps: [{ name: 'Mapa do site', on: '2026-09-04' }],
    updates: [],
    approvals: [],
    retainer: [
      { month: '2026-09-01', limits: [{ kind: 'maintenance_hours', used: 6, available: 12 }] },
    ],
    outcome: null,
  },
  canWrite: true,
};

describe('C-14 client reports', () => {
  it('list shows kind, period and state', () => {
    wrap(<ReportsList clientId="c1" view={LIST} create={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Relatórios' })).toBeTruthy();
    const qbr = screen.getByRole('link', { name: 'QBR · T3 2026' });
    expect(qbr.getAttribute('href')).toBe('/c/c1/reports/r1');
    expect(screen.getByText('Partilhado em 05/10/2026')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Relatório mensal · setembro de 2026' })).toBeTruthy();
    expect(screen.getByText('Rascunho')).toBeTruthy();
  });

  it('new report creates the chosen period and opens it', async () => {
    const create = vi.fn().mockResolvedValue({ ok: true, reportId: 'r9' });
    wrap(<ReportsList clientId="c1" view={LIST} create={create} />);

    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'qbr' } });
    expect((screen.getByLabelText('Período') as HTMLSelectElement).value).toBe('2026-07-01');
    fireEvent.click(screen.getByRole('button', { name: 'Criar relatório' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        clientId: 'c1',
        kind: 'qbr',
        periodStart: '2026-07-01',
      }),
    );
    expect(push).toHaveBeenCalledWith('/c/c1/reports/r9');
  });

  it('list without write has no new report', () => {
    wrap(<ReportsList clientId="c1" view={{ ...LIST, canWrite: false }} create={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Criar relatório' })).toBeNull();
  });

  it('editor shows the period data and hides priorities in a monthly report', () => {
    wrap(<ReportEditor view={REPORT} actions={{ save: vi.fn(), share: vi.fn() }} />);

    expect(screen.getByText('04/09/2026 · Mapa do site')).toBeTruthy();
    expect(screen.getByText('Horas de manutenção: 6 de 12')).toBeTruthy();
    expect((screen.getByLabelText('Resumo') as HTMLTextAreaElement).value).toBe(
      'Um mês de entregas.',
    );
    expect(screen.queryByLabelText('Prioridades do próximo trimestre')).toBeNull();
    expect(screen.getByRole('link', { name: 'Pré-visualizar PDF' }).getAttribute('href')).toBe(
      '/api/client-reports/r2/pdf',
    );
  });

  it('editor saves the texts and shares after confirming', async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const share = vi.fn().mockResolvedValue({ ok: true });
    wrap(
      <ReportEditor
        view={{ ...REPORT, period: { kind: 'qbr', start: '2026-07-01', end: '2026-09-30' } }}
        actions={{ save, share }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Prioridades do próximo trimestre'), {
      target: { value: 'Crescer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        reportId: 'r2',
        texts: {
          summary: 'Um mês de entregas.',
          highlights: '',
          nextSteps: '',
          priorities: 'Crescer',
        },
      }),
    );

    await screen.findByText('Guardado.');
    // The save's transition ends after its message, so the share button is enabled a beat later.
    const shareButton = screen.getByRole('button', { name: 'Partilhar com o cliente' });
    await waitFor(() => expect((shareButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(shareButton);
    expect(share).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Partilhar' }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ reportId: 'r2' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('editor is read-only without write and links the shared document', () => {
    wrap(
      <ReportEditor
        view={{
          ...REPORT,
          canWrite: false,
          status: 'shared',
          documentId: 'r2',
          sharedAt: new Date('2026-10-05T10:00:00Z'),
        }}
        actions={{ save: vi.fn(), share: vi.fn() }}
      />,
    );

    expect((screen.getByLabelText('Resumo') as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Pré-visualizar PDF' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Ver documento' }).getAttribute('href')).toBe(
      '/c/c1/docs/r2',
    );
  });
});
