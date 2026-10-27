export {
  aggregateMonthly,
  detectDateColumn,
  detectSource,
  monthOf,
  parseCsv,
  parseNumber,
  type CsvTable,
  type KpiAggregation,
  type MonthlyValue,
} from './domain/csv';
export { currentMonth, isMonth, monthsUpTo } from './domain/months';
export type {
  ClientKpiView,
  ClientResultsView,
  KpiFormat,
  KpiPoint,
  PortalKpiView,
} from './readers';

/** What a results action returns to the screen. */
export type ResultsActionResult = { ok: true; count?: number } | { ok: false; code: string };
export type { KpiInput } from './kpis';
export type { KpiValuesInput } from './values';
