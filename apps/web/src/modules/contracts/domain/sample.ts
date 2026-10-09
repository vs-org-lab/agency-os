import type { ContractValues } from './render';

/** Placeholder data for previewing a contract template in settings. */
export const SAMPLE_CONTRACT_VALUES: ContractValues = {
  entity: {
    legalName: 'Aurion Creative, Lda',
    taxId: '516000000',
    address: 'Avenida da Liberdade 1, 1250-001 Lisboa',
    country: 'PT',
    representativeName: 'Vladimir Silva',
    representativeRole: 'Gerente',
  },
  client: {
    legalName: 'Empresa Exemplo, SA',
    taxId: '500000000',
    address: 'Rua do Exemplo 10, 4000-001 Porto',
    signerName: 'Ana Costa',
    signerRole: 'Administradora',
  },
  option: {
    name: 'Orbit com Gravity',
    summary: 'Novo site, conteúdo e ativação de campanhas.',
    scope: ['Novo site institucional', 'Rastreamento de conversões', 'Campanhas de pesquisa'],
    oneOffAmount: '12000.00',
    paymentPlan: [
      { label: 'Assinatura', percent: 50 },
      { label: 'Entrega', percent: 50 },
    ],
    retainerMonthly: '1500.00',
    retainerMonths: 12,
  },
  proposal: { guarantee: 'Garantia de 30 dias sobre o trabalho entregue.', currency: 'EUR' },
  contractDate: new Date('2026-10-09T10:00:00Z'),
};
