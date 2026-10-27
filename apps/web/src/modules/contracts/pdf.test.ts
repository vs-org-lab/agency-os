import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { pdfContainsText as containsText } from '@/platform/pdf-testing';
import { buildContractPdf, type ContractPdfInput } from './pdf';

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

  it('writes module headings without their markdown marks', async () => {
    const pdf = await buildContractPdf({
      ...INPUT,
      body: [
        '## 2. Âmbito',
        '',
        '### Módulo A — Vídeo e motion graphics',
        '',
        '- Edição de vídeo',
      ].join('\n'),
    });
    expect(containsText(pdf, 'Módulo A')).toBe(true);
    expect(containsText(pdf, '###')).toBe(false);
  });
});
