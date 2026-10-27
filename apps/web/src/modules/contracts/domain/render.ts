import type { CountryCode, PaymentStep } from '@agency-os/db';
import { formatMoney, type Currency, type Locale } from '@agency-os/i18n';
import { moduleClauses, type ContractModule } from './modules';
import { splitAmount, toMinorUnits } from './payments';
import { FIELD_PATTERN, isTemplateField, type TemplateField } from './template';

export type ContractValues = {
  entity: {
    legalName: string;
    taxId: string;
    address: string;
    country: CountryCode;
    representativeName: string;
    representativeRole: string;
  };
  client: {
    legalName: string;
    taxId: string;
    address: string;
    signerName: string;
    signerRole: string;
  };
  option: {
    name: string;
    summary: string;
    scope: string[];
    oneOffAmount: string;
    paymentPlan: PaymentStep[];
    retainerMonthly: string | null;
    retainerMonths: number | null;
    modules: ContractModule[];
  };
  proposal: { guarantee: string; currency: Currency };
  contractDate: Date;
};

const CONTRACT_TIME_ZONE = 'Europe/Lisbon';

type RenderCopy = {
  countries: Record<CountryCode, string>;
  notApplicable: string;
  retainer: (amount: string, months: number) => string;
};

const COPY: Record<Locale, RenderCopy> = {
  'pt-PT': {
    countries: { PT: 'Portugal', AO: 'Angola' },
    notApplicable: 'Não aplicável',
    retainer: (amount, months) => `${amount} por mês, durante ${months} meses`,
  },
  en: {
    countries: { PT: 'Portugal', AO: 'Angola' },
    notApplicable: 'Not applicable',
    retainer: (amount, months) => `${amount} per month, for ${months} months`,
  },
};

function fieldValue(field: TemplateField, values: ContractValues, locale: Locale): string {
  const copy = COPY[locale];
  const money = (minor: bigint) => formatMoney(minor, values.proposal.currency, locale);
  const { option } = values;
  switch (field) {
    case 'entidade.denominacao':
      return values.entity.legalName;
    case 'entidade.nif':
      return values.entity.taxId;
    case 'entidade.morada':
      return values.entity.address;
    case 'entidade.pais':
      return copy.countries[values.entity.country];
    case 'entidade.representante':
      return values.entity.representativeName;
    case 'entidade.cargo':
      return values.entity.representativeRole;
    case 'cliente.denominacao':
      return values.client.legalName;
    case 'cliente.nif':
      return values.client.taxId;
    case 'cliente.morada':
      return values.client.address;
    case 'cliente.signatario':
      return values.client.signerName;
    case 'cliente.cargo':
      return values.client.signerRole;
    case 'opcao.nome':
      return option.name;
    case 'opcao.resumo':
      return option.summary;
    case 'opcao.ambito':
      return option.scope.map((line) => `- ${line}`).join('\n');
    case 'opcao.modulos':
      return moduleClauses(option.modules, locale, values.proposal.currency);
    case 'opcao.valor':
      return money(toMinorUnits(option.oneOffAmount));
    case 'opcao.pagamentos': {
      const parts = splitAmount(toMinorUnits(option.oneOffAmount), option.paymentPlan);
      return option.paymentPlan
        .map((step, index) => `- ${step.label}: ${step.percent}% (${money(parts[index] ?? 0n)})`)
        .join('\n');
    }
    case 'opcao.retainer':
      return option.retainerMonthly && option.retainerMonths
        ? copy.retainer(money(toMinorUnits(option.retainerMonthly)), option.retainerMonths)
        : copy.notApplicable;
    case 'proposta.garantia':
      return values.proposal.guarantee;
    case 'proposta.moeda':
      return values.proposal.currency;
    case 'contrato.data':
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'long',
        timeZone: CONTRACT_TIME_ZONE,
      }).format(values.contractDate);
  }
}

/** Replaces every template field; templates are validated before they are published. */
export function renderContract(body: string, values: ContractValues, locale: Locale): string {
  return body.replace(FIELD_PATTERN, (match, name: string) =>
    isTemplateField(name) ? fieldValue(name, values, locale) : match,
  );
}
