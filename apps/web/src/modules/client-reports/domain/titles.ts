import { quarterOf, type ReportPeriod } from './periods';

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

/** "outubro 2026" for a month, "T3 2026" for a quarter. */
export function periodLabel(period: ReportPeriod): string {
  if (period.kind === 'qbr') {
    const { quarter, year } = quarterOf(period.start);
    return `T${quarter} ${year}`;
  }
  return `${MONTH_NAMES[Number(period.start.slice(5, 7)) - 1]} ${period.start.slice(0, 4)}`;
}

/** The title of the room document the report is shared as. */
export function documentTitle(period: ReportPeriod): string {
  return period.kind === 'qbr'
    ? `QBR — ${periodLabel(period)}`
    : `Relatório mensal — ${periodLabel(period)}`;
}

/** The title on the first page or the cover slide. */
export function pdfTitle(period: ReportPeriod, clientName: string): string {
  return period.kind === 'qbr'
    ? `QBR · ${clientName} · ${periodLabel(period)}`
    : `Relatório mensal · ${clientName} · ${periodLabel(period)}`;
}

export function pdfFileName(period: ReportPeriod): string {
  if (period.kind === 'qbr') {
    const { quarter, year } = quarterOf(period.start);
    return `qbr-${year}-t${quarter}.pdf`;
  }
  return `relatorio-${period.start.slice(0, 7)}.pdf`;
}
