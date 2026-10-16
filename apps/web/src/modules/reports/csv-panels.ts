import type { VerifiedClaims } from '@/platform/db';
import type { ReportsDeps } from './access';
import { toCsv } from './domain/csv';
import { loadReports, type ReportsView } from './readers';

export const REPORT_PANELS = [
  'revenue',
  'recurring',
  'pipeline',
  'conversion',
  'load',
  'at-risk',
] as const;

export type ReportPanel = (typeof REPORT_PANELS)[number];

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const STAGE_LABEL = {
  pre_sale: 'Pré-venda',
  core: 'Core',
  orbit: 'Orbit',
  gravity: 'Gravity',
  constellation: 'Constellation',
  off_cycle: 'Fora do ciclo',
} as const;

function table(view: ReportsView, panel: ReportPanel): [string[], (string | number | null)[][]] {
  switch (panel) {
    case 'revenue':
      return [
        ['Moeda', ...MONTHS, 'Total'],
        view.revenue.map((row) => [row.currency, ...row.months, row.total]),
      ];
    case 'recurring':
      return [
        ['Moeda', 'Receita recorrente mensal', 'Retainers'],
        view.recurring.map((row) => [row.currency, row.monthly, row.retainers]),
      ];
    case 'pipeline':
      return [
        ['Etapa', 'Código', 'Negócios'],
        view.pipeline.flatMap((group) =>
          group.codes.map((code) => [STAGE_LABEL[group.stage], code.code, code.deals]),
        ),
      ];
    case 'conversion':
      return [
        ['De', 'Para', 'Entraram', 'Passaram', 'Conversão (%)'],
        view.conversion.map((row) => [
          STAGE_LABEL[row.from],
          STAGE_LABEL[row.to],
          row.entered,
          row.passed,
          row.percent,
        ]),
      ];
    case 'load':
      return [
        ['Membro', 'Tarefas desta semana', 'Projetos ativos', 'Horas semanais'],
        view.load.map((row) => [row.name, row.tasksThisWeek, row.activeProjects, row.weeklyHours]),
      ];
    case 'at-risk':
      return [
        ['Cliente', 'Saúde', 'Saúde há 30 dias'],
        view.atRisk.map((row) => [row.name, row.score, row.scoreBefore]),
      ];
  }
}

/** RF-132: one S-11 panel as CSV, for founders only. */
export async function reportCsv(
  claims: VerifiedClaims,
  panel: ReportPanel,
  year: number,
  deps: ReportsDeps,
): Promise<{ filename: string; body: string } | null> {
  const view = await loadReports(claims, year, deps);
  if (!view) return null;
  const [headers, rows] = table(view, panel);
  return { filename: `${panel}-${year}.csv`, body: toCsv(headers, rows) };
}
