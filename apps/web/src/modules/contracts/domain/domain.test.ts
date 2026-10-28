import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTRACT_TEMPLATES } from '../templates/defaults';
import { validatePaymentPlan } from './payments';
import { renderContract, type ContractValues } from './render';
import { contractHash, sameSigner } from './signature';
import { TEMPLATE_FIELDS, validateTemplate } from './template';

function spaced(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, ' ');
}

const values: ContractValues = {
  entity: {
    legalName: 'Aurion Creative Lda',
    taxId: '516000000',
    address: 'Av. da Liberdade, Lisboa',
    country: 'PT',
    representativeName: 'Vladimir Silva',
    representativeRole: 'Gerente',
  },
  client: {
    legalName: 'Empresa Cliente SA',
    taxId: '500100200',
    address: 'Rua do Cliente, Porto',
    signerName: 'Ana Costa',
    signerRole: 'Administradora',
  },
  option: {
    name: 'Orbit com Gravity',
    summary: 'Site novo e ativação',
    scope: ['Novo site institucional', 'Rastreamento de conversões'],
    oneOffAmount: '12000.00',
    paymentPlan: [
      { label: 'Assinatura', percent: 50 },
      { label: 'Entrega', percent: 50 },
    ],
    retainerMonthly: '1500.00',
    retainerMonths: 12,
    modules: [{ code: 'A', params: { videosPerMonth: 8, revisions: 2 } }],
  },
  proposal: { guarantee: 'Garantia de 30 dias', currency: 'EUR' },
  contractDate: new Date('2026-10-09T10:00:00Z'),
};

describe('validateTemplate', () => {
  it('accepts every known field', () => {
    expect(validateTemplate(TEMPLATE_FIELDS.map((field) => `{{${field}}}`).join('\n'))).toEqual({
      ok: true,
    });
  });

  it('rejects unknown fields', () => {
    expect(validateTemplate('Olá {{cliente.denominacao}} e {{cliente.telefone}}')).toEqual({
      ok: false,
      unknown: ['cliente.telefone'],
      unbalanced: false,
    });
  });

  it('rejects unbalanced braces', () => {
    expect(validateTemplate('Olá {{cliente.denominacao')).toMatchObject({
      ok: false,
      unbalanced: true,
    });
  });

  it('defaults are valid in both languages', () => {
    for (const body of Object.values(DEFAULT_CONTRACT_TEMPLATES)) {
      expect(validateTemplate(body)).toEqual({ ok: true });
    }
  });
});

describe('renderContract', () => {
  it('renders every field', () => {
    const body = TEMPLATE_FIELDS.map((field) => `${field}={{${field}}}`).join('\n');

    const rendered = spaced(renderContract(body, values, 'pt-PT'));

    expect(rendered).toContain('entidade.denominacao=Aurion Creative Lda');
    expect(rendered).toContain('entidade.pais=Portugal');
    expect(rendered).toContain('cliente.signatario=Ana Costa');
    expect(rendered).toContain('opcao.valor=12 000,00 €');
    expect(rendered).toContain('opcao.retainer=1500,00 € por mês, durante 12 meses');
    expect(rendered).toContain('proposta.moeda=EUR');
    expect(rendered).toContain('contrato.data=9 de outubro de 2026');
    expect(rendered).toContain('opcao.modulos=### Módulo A — Vídeo e motion graphics');
    expect(rendered).not.toContain('{{');
  });

  it('renders scope and payments as lists', () => {
    const rendered = spaced(
      renderContract(
        'Âmbito:\n{{opcao.ambito}}\nPagamentos:\n{{opcao.pagamentos}}',
        values,
        'pt-PT',
      ),
    );

    expect(rendered).toBe(
      [
        'Âmbito:',
        '- Novo site institucional',
        '- Rastreamento de conversões',
        'Pagamentos:',
        '- Assinatura: 50% (6000,00 €)',
        '- Entrega: 50% (6000,00 €)',
      ].join('\n'),
    );
  });

  it('formats kwanzas', () => {
    const rendered = spaced(
      renderContract(
        '{{opcao.valor}}',
        { ...values, proposal: { ...values.proposal, currency: 'AOA' } },
        'pt-PT',
      ),
    );

    expect(rendered).toBe('12 000,00 Kz');
  });

  it('says not applicable without retainer', () => {
    const withoutRetainer = {
      ...values,
      option: { ...values.option, retainerMonthly: null, retainerMonths: null },
    };

    expect(renderContract('{{opcao.retainer}}', withoutRetainer, 'pt-PT')).toBe('Não aplicável');
    expect(renderContract('{{opcao.retainer}}', withoutRetainer, 'en')).toBe('Not applicable');
  });

  it('splits uneven payments without losing a cent', () => {
    const rendered = spaced(
      renderContract(
        '{{opcao.pagamentos}}',
        {
          ...values,
          option: {
            ...values.option,
            oneOffAmount: '1000.00',
            paymentPlan: [
              { label: 'A', percent: 33 },
              { label: 'B', percent: 33 },
              { label: 'C', percent: 34 },
            ],
          },
        },
        'en',
      ),
    );

    expect(rendered).toBe('- A: 33% (€330.00)\n- B: 33% (€330.00)\n- C: 34% (€340.00)');
  });
});

describe('validatePaymentPlan', () => {
  it('payment plan must sum to 100', () => {
    expect(validatePaymentPlan([{ label: 'Assinatura', percent: 100 }])).toBe(true);
    expect(
      validatePaymentPlan([
        { label: 'Assinatura', percent: 50 },
        { label: 'Entrega', percent: 40 },
      ]),
    ).toBe(false);
    expect(validatePaymentPlan([])).toBe(false);
    expect(validatePaymentPlan([{ label: ' ', percent: 100 }])).toBe(false);
    expect(
      validatePaymentPlan([
        { label: 'A', percent: 50.5 },
        { label: 'B', percent: 49.5 },
      ]),
    ).toBe(false);
  });
});

describe('signature', () => {
  it('hash is stable', () => {
    expect(contractHash('Contrato')).toBe(contractHash('Contrato'));
    expect(contractHash('Contrato')).toMatch(/^[0-9a-f]{64}$/);
    expect(contractHash('Contrato')).not.toBe(contractHash('Contrato.'));
  });

  it('signer name ignores case and spacing', () => {
    expect(sameSigner('  ana   COSTA ', 'Ana Costa')).toBe(true);
    expect(sameSigner('Ana Costa Silva', 'Ana Costa')).toBe(false);
    expect(sameSigner('', 'Ana Costa')).toBe(false);
  });
});
