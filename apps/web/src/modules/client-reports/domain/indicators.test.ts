import { describe, expect, it } from 'vitest';
import { reportIndicators } from './indicators';
import { periodOf } from './periods';

const KPI = { id: 'kpi-1', name: 'Leads', format: 'number' as const, source: 'GA4', target: 40 };

describe('reportIndicators', () => {
  it('compares the month with the one before it', () => {
    const [leads] = reportIndicators(
      [{ ...KPI, aggregation: 'sum' }],
      [
        { kpiId: 'kpi-1', month: '2026-08-01', value: 20 },
        { kpiId: 'kpi-1', month: '2026-09-01', value: 30 },
      ],
      periodOf('monthly', '2026-09-10'),
    );
    expect(leads).toEqual({
      name: 'Leads',
      format: 'number',
      source: 'GA4',
      target: 40,
      current: 30,
      previous: 20,
    });
  });

  it('aggregates a quarter by the indicator rule and leaves missing periods empty', () => {
    const values = [
      { kpiId: 'kpi-1', month: '2026-07-01', value: 10 },
      { kpiId: 'kpi-1', month: '2026-08-01', value: 20 },
      { kpiId: 'kpi-1', month: '2026-09-01', value: 30 },
    ];
    const quarter = periodOf('qbr', '2026-09-10');

    expect(reportIndicators([{ ...KPI, aggregation: 'sum' }], values, quarter)[0]).toMatchObject({
      current: 60,
      previous: null,
    });
    expect(
      reportIndicators([{ ...KPI, aggregation: 'average' }], values, quarter)[0]?.current,
    ).toBe(20);
    expect(reportIndicators([{ ...KPI, aggregation: 'last' }], values, quarter)[0]?.current).toBe(
      30,
    );
  });

  it('leaves out indicators without values in either period', () => {
    expect(
      reportIndicators(
        [{ ...KPI, aggregation: 'sum' }],
        [{ kpiId: 'kpi-1', month: '2026-01-01', value: 5 }],
        periodOf('monthly', '2026-09-10'),
      ),
    ).toEqual([]);
  });
});
