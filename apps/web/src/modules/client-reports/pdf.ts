import { formatKpi, kpiChange } from '@/modules/results';
import type { RetainerLimitKind } from '@/modules/retainers';
import { createDeck, createPdf } from '@/platform/pdf';
import type { ReportData, ReportTexts } from './domain/content';
import type { ReportIndicator } from './domain/indicators';
import type { ReportPeriod } from './domain/periods';
import { periodLabel, pdfTitle } from './domain/titles';

export type ReportPdfInput = {
  clientName: string;
  period: ReportPeriod;
  data: ReportData;
  texts: ReportTexts;
};

type Block = { type: 'heading' | 'item' | 'text'; text: string };
type Section = { title: string; blocks: Block[] };

const LIMIT_LABELS: Record<RetainerLimitKind, string> = {
  content_pieces: 'Peças de conteúdo',
  campaigns: 'Campanhas',
  maintenance_hours: 'Horas de manutenção',
  automations: 'Automações',
};

const NUMBER = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 });

const day = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
const number = (value: string | number) => NUMBER.format(Number(value));
const dated = (entries: { on: string; text: string }[]): Block[] =>
  entries.map((entry) => ({ type: 'item', text: `${day(entry.on)} · ${entry.text}` }));
const text = (value: string): Block[] => (value ? [{ type: 'text', text: value }] : []);

function work(data: ReportData): Block[] {
  const groups: [string, { on: string; text: string }[]][] = [
    ['Passos concluídos', data.steps.map((step) => ({ on: step.on, text: step.name }))],
    ['Atualizações', data.updates.map((update) => ({ on: update.on, text: update.title }))],
    ['Documentos aprovados', data.approvals.map((item) => ({ on: item.on, text: item.title }))],
  ];
  return groups.flatMap(([heading, entries]) =>
    entries.length > 0 ? [{ type: 'heading' as const, text: heading }, ...dated(entries)] : [],
  );
}

function retainer(data: ReportData): Block[] {
  return (data.retainer ?? []).flatMap((month) => [
    {
      type: 'heading' as const,
      text: periodLabel({ kind: 'monthly', start: month.month, end: month.month }),
    },
    ...month.limits.map((limit) => ({
      type: 'item' as const,
      text: `${LIMIT_LABELS[limit.kind]}: ${number(limit.used)} de ${number(limit.available)}`,
    })),
  ]);
}

function outcome(data: ReportData): Block[] {
  if (!data.outcome) return [];
  const { metric, baseline, target, deadline, measurements } = data.outcome;
  return [
    { type: 'heading', text: metric },
    {
      type: 'text',
      text: `Linha de base: ${number(baseline)} · Meta: ${number(target)} · Prazo: ${day(deadline)}`,
    },
    ...dated(measurements.map((entry) => ({ on: entry.on, text: number(entry.value) }))),
  ];
}

const LOCALE = 'pt-PT';
const CHANGE_UNIT = { percent: '%', points: ' p.p.', value: '×' } as const;

const figure = (indicator: ReportIndicator, value: number | null) =>
  value === null ? 'sem valor' : formatKpi(value, indicator.format, LOCALE);

/** "+50%", "-0,2 p.p." or "" when there is nothing to compare. */
function changeOf(indicator: ReportIndicator): string {
  if (indicator.current === null) return '';
  const change = kpiChange(indicator.current, indicator.previous, indicator.format);
  if (!change) return '';
  const sign = change.direction === 'up' ? '+' : change.direction === 'down' ? '-' : '';
  return `${sign}${NUMBER.format(change.amount)}${CHANGE_UNIT[change.unit]}`;
}

function indicatorLine(indicator: ReportIndicator): string {
  return [
    `${indicator.name}: ${figure(indicator, indicator.current)}`,
    indicator.previous === null ? '' : `anterior ${figure(indicator, indicator.previous)}`,
    changeOf(indicator),
    indicator.target === null
      ? ''
      : `meta ${formatKpi(indicator.target, indicator.format, LOCALE)}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

const indicatorsOf = (data: ReportData) => data.indicators ?? [];

/** The template's sections in order (RF-130); the QBR adds next quarter's priorities. */
function sections({ period, data, texts }: ReportPdfInput): Section[] {
  const all: Section[] = [
    { title: 'Resumo', blocks: text(texts.summary) },
    {
      title: 'Indicadores',
      blocks: indicatorsOf(data).map((indicator) => ({
        type: 'item' as const,
        text: indicatorLine(indicator),
      })),
    },
    { title: 'Trabalho feito', blocks: work(data) },
    { title: 'Retainer', blocks: retainer(data) },
    { title: 'Resultado', blocks: outcome(data) },
    { title: 'Destaques', blocks: text(texts.highlights) },
    ...(period.kind === 'qbr'
      ? [{ title: 'Prioridades do próximo trimestre', blocks: text(texts.priorities) }]
      : []),
    { title: 'Próximos passos', blocks: text(texts.nextSteps) },
  ];
  return all.filter((section) => section.blocks.length > 0);
}

/** The monthly report: A4 portrait, the sections one after another. */
export async function monthlyReportPdf(input: ReportPdfInput): Promise<Uint8Array> {
  const title = pdfTitle(input.period, input.clientName);
  const { document, fonts, writer } = await createPdf({ title });
  writer.eyebrow('Relatório mensal');
  writer.title(title, 20);
  writer.rule();
  for (const section of sections(input)) {
    writer.paragraph(section.title, { size: 15, font: fonts.serif });
    writer.space(4);
    for (const block of section.blocks) {
      if (block.type === 'heading') writer.paragraph(block.text, { bold: true });
      else if (block.type === 'item') writer.paragraph(block.text, { indent: 12 });
      else for (const line of block.text.split(/\n+/)) writer.paragraph(line);
    }
    writer.space(14);
  }
  return document.save();
}

/**
 * The QBR as a 16:9 performance report in the brand template: Ink cover, executive summary with
 * the four headline indicators, the comparison with the previous quarter, the sections and a close.
 */
export async function qbrDeckPdf(input: ReportPdfInput): Promise<Uint8Array> {
  const title = pdfTitle(input.period, input.clientName);
  const { document, slides } = await createDeck({ title });
  const indicators = indicatorsOf(input.data);
  slides.cover('Relatório de performance', input.clientName, periodLabel(input.period));

  if (indicators.length > 0 || input.texts.summary) {
    slides.slide('Sumário executivo', 'Os indicadores que mais importam no período.');
    slides.metrics(
      indicators
        .filter((indicator) => indicator.current !== null)
        .map((indicator) => ({
          value: figure(indicator, indicator.current),
          label: indicator.name,
          note: changeOf(indicator)
            ? `${changeOf(indicator)} vs período anterior`
            : indicator.source,
        })),
    );
    if (input.texts.summary) slides.paragraph(input.texts.summary);
  }

  if (indicators.length > 0) {
    slides.slide('Indicadores', 'Comparação com o período anterior.');
    slides.comparison(
      indicators.map((indicator) => ({
        label: indicator.name,
        previous: indicator.previous,
        current: indicator.current,
        previousText: figure(indicator, indicator.previous),
        currentText: figure(indicator, indicator.current),
        change: changeOf(indicator),
      })),
      { previous: 'Período anterior', current: periodLabel(input.period) },
    );
  }

  for (const section of sections(input)) {
    if (section.title === 'Resumo' || section.title === 'Indicadores') continue;
    slides.slide(section.title);
    for (const block of section.blocks) {
      if (block.type === 'heading') slides.heading(block.text);
      else if (block.type === 'item') slides.bullet(block.text);
      else slides.paragraph(block.text);
    }
  }
  slides.closing('Obrigado.', '');
  return document.save();
}
