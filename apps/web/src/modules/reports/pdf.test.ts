import { describe, expect, it } from 'vitest';
import { pdfContainsText } from '@/platform/pdf-testing';
import { reportYear } from './domain/years';
import { reportsPdf } from './pdf';
import type { ReportsView } from './readers';

const VIEW: ReportsView = {
  year: 2026,
  revenue: [
    {
      currency: 'EUR',
      months: ['1500.00', ...Array.from({ length: 11 }, () => '0.00')],
      total: '1500.00',
    },
  ],
  recurring: [{ currency: 'EUR', monthly: '3000.00', retainers: 2 }],
  pipeline: [{ stage: 'core', codes: [{ code: '1.1', deals: 3 }] }],
  conversion: [{ from: 'pre_sale', to: 'core', entered: 4, passed: 1, percent: 25 }],
  load: [
    {
      userId: 'u1',
      name: 'Rita Gestora',
      tasksThisWeek: 5,
      activeProjects: 2,
      weeklyHours: 30,
    },
  ],
  atRisk: [{ clientId: 'c1', name: 'Bloom', score: 38, scoreBefore: 61 }],
};

describe('reports pdf', () => {
  it('reports pdf lists the six panels', async () => {
    const pdf = await reportsPdf(VIEW, new Date('2026-10-16T10:00:00Z'));

    for (const text of [
      'Relatórios · 2026',
      'Gerado em 16/10/2026',
      'Receita por mês',
      'Receita recorrente',
      'Negócios por código',
      'Conversão entre etapas',
      'Carga da equipa',
      'Clientes em risco',
      'Rita Gestora',
      'Bloom',
    ]) {
      expect(pdfContainsText(pdf, text), text).toBe(true);
    }
  });

  it('a panel without rows says so', async () => {
    const pdf = await reportsPdf({ ...VIEW, atRisk: [] }, new Date('2026-10-16T10:00:00Z'));
    expect(pdfContainsText(pdf, 'Sem dados')).toBe(true);
  });

  it('invalid year is not found', () => {
    expect(reportYear(null, 2026)).toBe(2026);
    expect(reportYear('', 2026)).toBe(2026);
    expect(reportYear('2025', 2026)).toBe(2025);
    expect(reportYear('1999', 2026)).toBeNull();
    expect(reportYear('2101', 2026)).toBeNull();
    expect(reportYear('99999999999', 2026)).toBeNull();
    expect(reportYear('2025.5', 2026)).toBeNull();
    expect(reportYear('abc', 2026)).toBeNull();
  });
});
