import { inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildContractPdf, type ContractPdfInput } from './pdf';

/** Decodes every stream of the file, compressed or not, and looks for the hex-encoded text. */
function containsText(pdf: Uint8Array, text: string): boolean {
  const raw = Buffer.from(pdf);
  const decoded: string[] = [raw.toString('latin1')];
  let cursor = 0;
  for (;;) {
    const start = raw.indexOf('stream', cursor, 'latin1');
    if (start < 0) break;
    const dataStart = raw[start + 6] === 0x0d ? start + 8 : start + 7;
    const end = raw.indexOf('endstream', dataStart, 'latin1');
    if (end < 0) break;
    try {
      decoded.push(inflateSync(raw.subarray(dataStart, end)).toString('latin1'));
    } catch {
      decoded.push(raw.subarray(dataStart, end).toString('latin1'));
    }
    cursor = end + 9;
  }
  const hex = Buffer.from(text, 'latin1').toString('hex').toUpperCase();
  return decoded.some((chunk) => chunk.toUpperCase().includes(hex));
}

const INPUT: ContractPdfInput = {
  title: 'Contrato de prestação de serviços',
  body: [
    '# Contrato de prestação de serviços',
    '',
    '## 1. Objeto',
    '',
    'A Aurion presta ao Cliente os serviços da opção escolhida, no valor de 12 000,00 €.',
    '',
    '- Novo site institucional',
    '- Rastreamento de conversões',
    '',
    Array.from({ length: 140 }, (_, index) => `Parágrafo ${index + 1} do contrato.`).join('\n\n'),
  ].join('\n'),
  hash: 'a'.repeat(64),
  labels: {
    signatures: 'Assinaturas',
    fingerprint: 'Impressão digital do texto (SHA-256)',
    signedBy: 'Assinado por',
    role: 'Cargo',
    email: 'Email',
    signedAt: 'Data',
    ipAddress: 'Endereço IP',
    page: 'Página {page} de {pages}',
  },
  signatures: [
    {
      party: 'Cliente',
      name: 'Ana Costa',
      role: 'Administradora',
      email: 'ana@cliente.test',
      signedAt: '9 de outubro de 2026, 10:00',
      ipAddress: '203.0.113.7',
    },
    {
      party: 'Aurion Creative Lda',
      name: 'Vladimir Silva',
      role: 'Gerente',
      email: 'geral@aurion.test',
      signedAt: '9 de outubro de 2026, 11:00',
      ipAddress: null,
    },
  ],
};

describe('buildContractPdf', () => {
  it('the pdf contains the text and the signature page', async () => {
    const pdf = await buildContractPdf(INPUT);
    const document = await PDFDocument.load(pdf);

    expect(document.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(document.getSubject()).toBe('a'.repeat(64));
    expect(document.getTitle()).toBe('Contrato de prestação de serviços');
    expect(containsText(pdf, 'Novo site institucional')).toBe(true);
    expect(containsText(pdf, 'Ana Costa')).toBe(true);
    expect(containsText(pdf, '203.0.113.7')).toBe(true);
    expect(containsText(pdf, 'a'.repeat(64))).toBe(true);
  });

  it('replaces characters the standard font cannot encode', async () => {
    const pdf = await buildContractPdf({
      ...INPUT,
      body: 'Valor: 12 000,00 € → pago',
    });

    expect(containsText(pdf, 'Valor: 12 000,00')).toBe(true);
  });
});
