import { describe, expect, it } from 'vitest';
import { closesQuarter, isFinished, periodOf, previousPeriod, quarterOf } from './periods';
import { reportTexts, updateTitle } from './content';
import { documentTitle, pdfFileName, pdfTitle } from './titles';

describe('client reports domain', () => {
  it('periods of a day', () => {
    expect(periodOf('monthly', '2026-02-14')).toEqual({
      kind: 'monthly',
      start: '2026-02-01',
      end: '2026-02-28',
    });
    expect(periodOf('monthly', '2028-02-29')).toEqual({
      kind: 'monthly',
      start: '2028-02-01',
      end: '2028-02-29',
    });
    expect(periodOf('qbr', '2026-11-30')).toEqual({
      kind: 'qbr',
      start: '2026-10-01',
      end: '2026-12-31',
    });
    expect(periodOf('qbr', '2026-04-01')).toEqual({
      kind: 'qbr',
      start: '2026-04-01',
      end: '2026-06-30',
    });
  });

  it('previous period across the year', () => {
    expect(previousPeriod('monthly', '2027-01-01')).toEqual({
      kind: 'monthly',
      start: '2026-12-01',
      end: '2026-12-31',
    });
    expect(previousPeriod('qbr', '2027-02-10')).toEqual({
      kind: 'qbr',
      start: '2026-10-01',
      end: '2026-12-31',
    });
    expect(previousPeriod('qbr', '2026-07-01').start).toBe('2026-04-01');
  });

  it('only finished periods', () => {
    const september = periodOf('monthly', '2026-09-10');
    expect(isFinished(september, '2026-09-30')).toBe(false);
    expect(isFinished(september, '2026-10-01')).toBe(true);
    expect(isFinished(periodOf('qbr', '2026-12-01'), '2026-10-16')).toBe(false);
  });

  it('quarters close in march, june, september and december', () => {
    expect(['01', '03', '06', '08', '09', '12'].map((m) => closesQuarter(`2026-${m}-01`))).toEqual([
      false,
      true,
      true,
      false,
      true,
      true,
    ]);
    expect(quarterOf('2026-07-01')).toEqual({ quarter: 3, year: 2026 });
    expect(quarterOf('2027-01-01')).toEqual({ quarter: 1, year: 2027 });
  });

  it('titles in pt-PT', () => {
    const october = periodOf('monthly', '2026-10-05');
    const third = periodOf('qbr', '2026-08-05');
    expect(documentTitle(october)).toBe('Relatório mensal — outubro de 2026');
    expect(documentTitle(third)).toBe('QBR — T3 2026');
    expect(pdfTitle(october, 'Bloom')).toBe('Relatório mensal · Bloom · outubro de 2026');
    expect(pdfTitle(third, 'Bloom')).toBe('QBR · Bloom · T3 2026');
    expect(pdfFileName(october)).toBe('relatorio-2026-10.pdf');
    expect(pdfFileName(third)).toBe('qbr-2026-t3.pdf');
  });

  it('texts are trimmed and limited', () => {
    expect(
      reportTexts('monthly', {
        summary: '  Mês forte. ',
        highlights: '',
        nextSteps: 'Lançar.',
        priorities: 'Ignorado',
      }),
    ).toEqual({ summary: 'Mês forte.', highlights: '', nextSteps: 'Lançar.', priorities: '' });
    expect(
      reportTexts('qbr', { summary: '', highlights: '', nextSteps: '', priorities: ' Crescer ' }),
    ).toEqual({ summary: '', highlights: '', nextSteps: '', priorities: 'Crescer' });
    expect(reportTexts('qbr', { summary: 'x'.repeat(2001) })).toBeNull();
    expect(reportTexts('monthly', 'nope')).toBeNull();
  });

  it('update titles come from the milestone or the start of the body', () => {
    expect(updateTitle({ milestone: 'Lançamento', body: 'Corpo' })).toBe('Lançamento');
    expect(updateTitle({ milestone: null, body: 'Curto.' })).toBe('Curto.');
    const long = `${'palavra '.repeat(30)}fim`;
    const title = updateTitle({ milestone: null, body: long });
    expect(title.length).toBeLessThanOrEqual(121);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toContain(' …');
  });
});
