import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { pdfContainsText } from '@/platform/pdf-testing';
import type { ReportData, ReportTexts } from './domain/content';
import { periodOf } from './domain/periods';
import { monthlyReportPdf, qbrDeckPdf } from './pdf';

const EMPTY: ReportData = { steps: [], updates: [], approvals: [], retainer: null, outcome: null };
const NO_TEXTS: ReportTexts = { summary: '', highlights: '', nextSteps: '', priorities: '' };

const DATA: ReportData = {
  steps: [{ name: 'Mapa do site', on: '2026-09-04' }],
  updates: [{ title: 'Lançamento da página', on: '2026-09-12' }],
  approvals: [{ title: 'Proposta de identidade', on: '2026-09-20' }],
  retainer: [
    { month: '2026-09-01', limits: [{ kind: 'maintenance_hours', used: 6, available: 10 }] },
  ],
  outcome: {
    metric: 'Pedidos de orçamento por mês',
    baseline: '12.00',
    target: '30.00',
    deadline: '2027-03-31',
    measurements: [{ on: '2026-09-30', value: '18.00' }],
  },
};

async function pages(pdf: Uint8Array) {
  return (await PDFDocument.load(pdf)).getPages().map((page) => page.getSize());
}

describe('client report pdfs', () => {
  it('monthly report lists the sections and omits empty ones', async () => {
    const pdf = await monthlyReportPdf({
      clientName: 'Bloom',
      period: periodOf('monthly', '2026-09-10'),
      data: DATA,
      texts: { ...NO_TEXTS, summary: 'Um mês de entregas.' },
    });

    for (const text of [
      'Relatório mensal · Bloom · setembro 2026',
      'Resumo',
      'Um mês de entregas.',
      'Trabalho feito',
      'Mapa do site',
      'Lançamento da página',
      'Proposta de identidade',
      'Retainer',
      'Horas de manutenção: 6 de 10',
      'Resultado',
      'Pedidos de orçamento por mês',
    ]) {
      expect(pdfContainsText(pdf, text), text).toBe(true);
    }
    expect(pdfContainsText(pdf, 'Destaques')).toBe(false);
    expect(pdfContainsText(pdf, 'Próximos passos')).toBe(false);
    const [size] = await pages(pdf);
    expect(size && size.height > size.width).toBe(true);
  });

  it('monthly report of an empty month still has its title', async () => {
    const pdf = await monthlyReportPdf({
      clientName: 'Bloom',
      period: periodOf('monthly', '2026-09-10'),
      data: EMPTY,
      texts: NO_TEXTS,
    });
    expect(pdfContainsText(pdf, 'Relatório mensal · Bloom · setembro 2026')).toBe(true);
    expect(pdfContainsText(pdf, 'Trabalho feito')).toBe(false);
  });

  it('qbr deck is landscape with one slide per section', async () => {
    const pdf = await qbrDeckPdf({
      clientName: 'Bloom',
      period: periodOf('qbr', '2026-09-10'),
      data: DATA,
      texts: { ...NO_TEXTS, summary: 'Trimestre de base.', priorities: 'Crescer no orgânico.' },
    });

    const sizes = await pages(pdf);
    // cover, summary, work, retainer, outcome, priorities
    expect(sizes).toHaveLength(6);
    expect(sizes.every((size) => size.width > size.height)).toBe(true);
    for (const text of [
      'QBR · Bloom · T3 2026',
      'Prioridades do próximo trimestre',
      'Crescer no orgânico.',
    ]) {
      expect(pdfContainsText(pdf, text), text).toBe(true);
    }
    expect(pdfContainsText(pdf, 'Destaques')).toBe(false);
  });

  it('qbr deck splits a long list across slides', async () => {
    const steps = Array.from({ length: 40 }, (_, index) => ({
      name: `Passo ${index + 1}`,
      on: '2026-08-01',
    }));
    const pdf = await qbrDeckPdf({
      clientName: 'Bloom',
      period: periodOf('qbr', '2026-09-10'),
      data: { ...EMPTY, steps },
      texts: NO_TEXTS,
    });

    const sizes = await pages(pdf);
    expect(sizes.length).toBeGreaterThan(2);
    expect(pdfContainsText(pdf, 'Trabalho feito (cont.)')).toBe(true);
    expect(pdfContainsText(pdf, '01/08/2026 · Passo 40')).toBe(true);
  });
});
