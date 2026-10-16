import type { RetainerLimitKind } from '@/modules/retainers';
import { createDeck, createPdf } from '@/platform/pdf';
import type { ReportData, ReportTexts } from './domain/content';
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

/** The template's sections in order (RF-130); the QBR adds next quarter's priorities. */
function sections({ period, data, texts }: ReportPdfInput): Section[] {
  const all: Section[] = [
    { title: 'Resumo', blocks: text(texts.summary) },
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
  const { document, writer } = await createPdf({ title });
  writer.paragraph(title, { size: 18, bold: true });
  writer.space(16);
  for (const section of sections(input)) {
    writer.paragraph(section.title, { size: 13, bold: true });
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

/** The QBR: A4 landscape slides, a cover and one slide per section. */
export async function qbrDeckPdf(input: ReportPdfInput): Promise<Uint8Array> {
  const title = pdfTitle(input.period, input.clientName);
  const { document, slides } = await createDeck({ title });
  slides.cover(title, 'Revisão trimestral do negócio');
  for (const section of sections(input)) {
    slides.slide(section.title);
    for (const block of section.blocks) {
      if (block.type === 'heading') slides.heading(block.text);
      else if (block.type === 'item') slides.bullet(block.text);
      else slides.paragraph(block.text);
    }
  }
  return document.save();
}
