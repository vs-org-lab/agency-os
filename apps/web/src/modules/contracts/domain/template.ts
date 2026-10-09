export const TEMPLATE_FIELDS = [
  'entidade.denominacao',
  'entidade.nif',
  'entidade.morada',
  'entidade.pais',
  'entidade.representante',
  'entidade.cargo',
  'cliente.denominacao',
  'cliente.nif',
  'cliente.morada',
  'cliente.signatario',
  'cliente.cargo',
  'opcao.nome',
  'opcao.resumo',
  'opcao.ambito',
  'opcao.valor',
  'opcao.pagamentos',
  'opcao.retainer',
  'proposta.garantia',
  'proposta.moeda',
  'contrato.data',
] as const;

export type TemplateField = (typeof TEMPLATE_FIELDS)[number];

export type TemplateValidation =
  { ok: true } | { ok: false; unknown: string[]; unbalanced: boolean };

export const FIELD_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

export function isTemplateField(value: string): value is TemplateField {
  return (TEMPLATE_FIELDS as readonly string[]).includes(value);
}

export function validateTemplate(body: string): TemplateValidation {
  const fields = [...body.matchAll(FIELD_PATTERN)].map((match) => match[1] ?? '');
  const unknown = [...new Set(fields)].filter((field) => !isTemplateField(field));
  const remainder = body.replace(FIELD_PATTERN, '');
  const unbalanced = remainder.includes('{{') || remainder.includes('}}');
  return unknown.length === 0 && !unbalanced ? { ok: true } : { ok: false, unknown, unbalanced };
}
