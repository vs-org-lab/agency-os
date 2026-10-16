import { createPdf, numberPages } from '@/platform/pdf';
import { panelTable, REPORT_PANELS, type ReportPanel } from './csv-panels';
import type { ReportsView } from './readers';

const PANEL_TITLES: Record<ReportPanel, string> = {
  revenue: 'Receita por mês',
  recurring: 'Receita recorrente',
  pipeline: 'Negócios por código',
  conversion: 'Conversão entre etapas',
  load: 'Carga da equipa',
  'at-risk': 'Clientes em risco',
};

const lisbonDate = new Intl.DateTimeFormat('pt-PT', {
  timeZone: 'Europe/Lisbon',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const cell = (value: string | number | null) => (value === null ? '—' : String(value));

/** RF-132: the six S-11 panels on A4 pages, each row as its header and value pairs. */
export async function reportsPdf(view: ReportsView, generatedAt: Date): Promise<Uint8Array> {
  const title = `Relatórios · ${view.year}`;
  const { document, fonts, writer } = await createPdf({ title });
  writer.paragraph(title, { size: 18, bold: true });
  writer.paragraph(`Gerado em ${lisbonDate.format(generatedAt)}`, { muted: true });
  writer.space(16);
  for (const panel of REPORT_PANELS) {
    const [headers, rows] = panelTable(view, panel);
    writer.paragraph(PANEL_TITLES[panel], { size: 13, bold: true });
    writer.space(4);
    if (rows.length === 0) writer.paragraph('Sem dados', { muted: true });
    for (const row of rows) {
      const [first, ...rest] = row;
      writer.paragraph(cell(first ?? null), { bold: true });
      writer.paragraph(
        rest.map((value, index) => `${headers[index + 1]}: ${cell(value)}`).join(' · '),
        { indent: 12 },
      );
    }
    writer.space(14);
  }
  numberPages(document, fonts, 'Página {page} de {pages}');
  return document.save();
}
