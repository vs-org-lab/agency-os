import { z } from 'zod';
import type { PaymentStep, ProposalModule } from '@agency-os/db';
import { formatMoney, type Currency, type Locale } from '@agency-os/i18n';
import { toMinorUnits } from './payments';

export const MODULE_CODES = ['A', 'B', 'C', 'D', 'E'] as const;
export type ModuleCode = (typeof MODULE_CODES)[number];

export const SOCIAL_PLATFORMS = ['instagram', 'linkedin', 'tiktok', 'facebook', 'youtube'] as const;
export const AD_PLATFORMS = ['meta', 'google', 'tiktok'] as const;
export const SOLUTIONS = ['website', 'landing', 'ecommerce', 'webapp', 'mobile', 'custom'] as const;
export const AUTOMATION_TOOLS = ['make', 'n8n', 'zapier', 'openai', 'other'] as const;

const count = z.number().int().min(0).max(999);
const money = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/)
  .refine((value) => Number(value) > 0);
const choices = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.enum(values))
    .min(1)
    .max(values.length)
    .refine((list) => new Set(list).size === list.length);

const moduleSchema = z.discriminatedUnion('code', [
  z.object({
    code: z.literal('A'),
    params: z.object({ videosPerMonth: count, revisions: z.number().int().min(0).max(20) }),
  }),
  z.object({
    code: z.literal('B'),
    params: z.object({
      platforms: choices(SOCIAL_PLATFORMS),
      feedPosts: count,
      storiesPerWeek: count,
    }),
  }),
  z.object({
    code: z.literal('C'),
    params: z.object({
      platforms: choices(AD_PLATFORMS),
      mediaBudget: money,
      managementFee: money,
    }),
  }),
  z.object({
    code: z.literal('D'),
    params: z.object({
      solution: z.enum(SOLUTIONS),
      technologies: z.string().trim().max(120),
      hosting: z.boolean(),
      sourceCode: z.boolean(),
    }),
  }),
  z.object({
    code: z.literal('E'),
    params: z.object({
      tools: choices(AUTOMATION_TOOLS),
      maintenanceMonths: z.number().int().min(0).max(36),
    }),
  }),
]);

export type ContractModule = z.infer<typeof moduleSchema>;

export const modulesSchema = z
  .array(moduleSchema)
  .max(MODULE_CODES.length)
  .refine((modules) => new Set(modules.map((module) => module.code)).size === modules.length);

/** The modules of a proposal option, validated; null when any is malformed or repeated. */
export function parseModules(input: unknown): ContractModule[] | null {
  const parsed = modulesSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

/** Stored modules read back; anything no longer valid is left out rather than failing the read. */
export function storedModules(input: readonly ProposalModule[] | null): ContractModule[] {
  return (input ?? []).flatMap((module) => {
    const parsed = moduleSchema.safeParse(module);
    return parsed.success ? [parsed.data] : [];
  });
}

type ClauseCopy = {
  titles: Record<ModuleCode, string>;
  commitments: Record<ModuleCode, string[]>;
  bundleTitle: string;
  bundle: string[];
  solutions: Record<(typeof SOLUTIONS)[number], string>;
  tools: Record<(typeof AUTOMATION_TOOLS)[number], string>;
  params: {
    A: (p: Extract<ContractModule, { code: 'A' }>['params']) => string[];
    B: (p: Extract<ContractModule, { code: 'B' }>['params'], list: string) => string[];
    C: (
      p: Extract<ContractModule, { code: 'C' }>['params'],
      list: string,
      money: (value: string) => string,
    ) => string[];
    D: (p: Extract<ContractModule, { code: 'D' }>['params'], solution: string) => string[];
    E: (p: Extract<ContractModule, { code: 'E' }>['params'], list: string) => string[];
  };
};

const SOCIAL_PLATFORM_NAMES: Record<(typeof SOCIAL_PLATFORMS)[number], string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  youtube: 'YouTube',
};

const AD_PLATFORM_NAMES: Record<(typeof AD_PLATFORMS)[number], string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
  tiktok: 'TikTok Ads',
};

const TOOL_NAMES = {
  make: 'Make.com',
  n8n: 'n8n',
  zapier: 'Zapier',
  openai: 'OpenAI API',
} as const;

const COPY: Record<Locale, ClauseCopy> = {
  'pt-PT': {
    titles: {
      A: 'Vídeo e motion graphics',
      B: 'Gestão de redes sociais',
      C: 'Tráfego pago',
      D: 'Web, software e apps',
      E: 'Automação e inteligência artificial',
    },
    commitments: {
      A: [
        'Edição de vídeo para plataformas digitais conforme o briefing aprovado.',
        'Motion graphics e animação 2D para conteúdo de marca.',
        'Thumbnails, capas e formatação para os formatos vertical, horizontal e quadrado.',
      ],
      B: [
        'Estratégia de conteúdo e calendário editorial mensal.',
        'Criação, copywriting, publicação e agendamento dos conteúdos.',
        'Community management em dias úteis e relatório mensal de performance.',
      ],
      C: [
        'Estratégia, configuração e lançamento das campanhas.',
        'Criativos publicitários, testes A/B e otimização contínua.',
        'Relatório mensal de alcance, CPM, CPC, ROAS e conversões.',
        'O orçamento de media é suportado diretamente pelo Cliente e é distinto do fee de gestão.',
      ],
      D: [
        'Design UI/UX e prototipagem.',
        'Desenvolvimento, integrações, testes e publicação.',
        'Documentação técnica de entrega.',
      ],
      E: [
        'Mapeamento dos processos a automatizar.',
        'Configuração dos fluxos, integrações e agentes de IA.',
        'Testes, documentação e formação básica ao Cliente.',
      ],
    },
    bundleTitle: 'Solução integrada',
    bundle: [
      'Gestor de projeto dedicado como ponto de contacto único.',
      'Dashboard partilhado de acompanhamento.',
      'Check-ins quinzenais de 30 minutos por videochamada.',
    ],
    solutions: {
      website: 'Website institucional',
      landing: 'Landing page',
      ecommerce: 'E-commerce',
      webapp: 'Web app',
      mobile: 'App mobile',
      custom: 'Software à medida',
    },
    tools: { ...TOOL_NAMES, other: 'Outras' },
    params: {
      A: (p) => [
        `Volume contratado: ${p.videosPerMonth} vídeos por mês.`,
        `Revisões incluídas: ${p.revisions} rondas por entregável.`,
      ],
      B: (p, list) => [
        `Plataformas incluídas: ${list}.`,
        `Publicações mensais: ${p.feedPosts} no feed e ${p.storiesPerWeek} stories por semana.`,
      ],
      C: (p, list, money) => [
        `Plataformas: ${list}.`,
        `Orçamento de media mensal: ${money(p.mediaBudget)}, da responsabilidade do Cliente.`,
        `Fee de gestão mensal: ${money(p.managementFee)}.`,
      ],
      D: (p, solution) => [
        `Tipo de solução: ${solution}.`,
        ...(p.technologies ? [`Tecnologias acordadas: ${p.technologies}.`] : []),
        `Hosting e domínio incluídos: ${p.hosting ? 'Sim' : 'Não'}.`,
        `Código fonte entregue: ${p.sourceCode ? 'Sim' : 'Não'}.`,
      ],
      E: (p, list) => [
        `Ferramentas: ${list}.`,
        p.maintenanceMonths > 0
          ? `Manutenção incluída: ${p.maintenanceMonths} meses.`
          : 'Manutenção não incluída.',
      ],
    },
  },
  en: {
    titles: {
      A: 'Video and motion graphics',
      B: 'Social media management',
      C: 'Paid media',
      D: 'Web, software and apps',
      E: 'Automation and artificial intelligence',
    },
    commitments: {
      A: [
        'Video editing for digital platforms following the approved brief.',
        'Motion graphics and 2D animation for brand content.',
        'Thumbnails, covers and formatting for vertical, horizontal and square formats.',
      ],
      B: [
        'Content strategy and a monthly editorial calendar.',
        'Content creation, copywriting, publishing and scheduling.',
        'Community management on business days and a monthly performance report.',
      ],
      C: [
        'Campaign strategy, setup and launch.',
        'Ad creatives, A/B tests and continuous optimisation.',
        'Monthly report on reach, CPM, CPC, ROAS and conversions.',
        'The media budget is paid directly by the Client and is separate from the management fee.',
      ],
      D: [
        'UI/UX design and prototyping.',
        'Development, integrations, testing and release.',
        'Technical handover documentation.',
      ],
      E: [
        'Mapping of the processes to automate.',
        'Set-up of the flows, integrations and AI agents.',
        'Testing, documentation and basic training for the Client.',
      ],
    },
    bundleTitle: 'Integrated solution',
    bundle: [
      'A dedicated project manager as the single point of contact.',
      'A shared progress dashboard.',
      'Fortnightly 30-minute check-ins by video call.',
    ],
    solutions: {
      website: 'Corporate website',
      landing: 'Landing page',
      ecommerce: 'E-commerce',
      webapp: 'Web app',
      mobile: 'Mobile app',
      custom: 'Custom software',
    },
    tools: { ...TOOL_NAMES, other: 'Other' },
    params: {
      A: (p) => [
        `Volume: ${p.videosPerMonth} videos per month.`,
        `Revisions included: ${p.revisions} rounds per deliverable.`,
      ],
      B: (p, list) => [
        `Platforms included: ${list}.`,
        `Monthly posts: ${p.feedPosts} feed posts and ${p.storiesPerWeek} stories per week.`,
      ],
      C: (p, list, money) => [
        `Platforms: ${list}.`,
        `Monthly media budget: ${money(p.mediaBudget)}, paid by the Client.`,
        `Monthly management fee: ${money(p.managementFee)}.`,
      ],
      D: (p, solution) => [
        `Solution: ${solution}.`,
        ...(p.technologies ? [`Agreed technologies: ${p.technologies}.`] : []),
        `Hosting and domain included: ${p.hosting ? 'Yes' : 'No'}.`,
        `Source code delivered: ${p.sourceCode ? 'Yes' : 'No'}.`,
      ],
      E: (p, list) => [
        `Tools: ${list}.`,
        p.maintenanceMonths > 0
          ? `Maintenance included: ${p.maintenanceMonths} months.`
          : 'Maintenance not included.',
      ],
    },
  },
};

function parameterLines(
  module: ContractModule,
  copy: ClauseCopy,
  money: (value: string) => string,
): string[] {
  switch (module.code) {
    case 'A':
      return copy.params.A(module.params);
    case 'B':
      return copy.params.B(
        module.params,
        module.params.platforms.map((platform) => SOCIAL_PLATFORM_NAMES[platform]).join(', '),
      );
    case 'C':
      return copy.params.C(
        module.params,
        module.params.platforms.map((platform) => AD_PLATFORM_NAMES[platform]).join(', '),
        money,
      );
    case 'D':
      return copy.params.D(module.params, copy.solutions[module.params.solution]);
    case 'E':
      return copy.params.E(
        module.params,
        module.params.tools.map((tool) => copy.tools[tool]).join(', '),
      );
  }
}

/**
 * The scope clauses of the chosen modules in contract markdown, in module order, with the
 * integrated-solution clause when two or more are chosen. Empty without modules.
 */
export function moduleClauses(
  modules: readonly ContractModule[],
  locale: Locale,
  currency: Currency,
): string {
  if (modules.length === 0) return '';
  const copy = COPY[locale];
  const money = (value: string) => formatMoney(toMinorUnits(value), currency, locale);
  const ordered = [...modules].sort((a, b) => a.code.localeCompare(b.code));
  const blocks = ordered.map((module) =>
    [
      `### ${locale === 'en' ? 'Module' : 'Módulo'} ${module.code} — ${copy.titles[module.code]}`,
      '',
      ...copy.commitments[module.code].map((line) => `- ${line}`),
      '',
      ...parameterLines(module, copy, money),
    ].join('\n'),
  );
  if (ordered.length >= 2) {
    blocks.push(
      [`### ${copy.bundleTitle}`, '', ...copy.bundle.map((line) => `- ${line}`)].join('\n'),
    );
  }
  return blocks.join('\n\n');
}

type PaymentPreset = { steps: (locale: Locale) => PaymentStep[]; retainer: boolean };

const STEP_LABELS: Record<Locale, { signing: string; midpoint: string; delivery: string }> = {
  'pt-PT': {
    signing: 'Na assinatura',
    midpoint: 'A meio do projeto',
    delivery: 'Na entrega e aprovação final',
  },
  en: { signing: 'On signing', midpoint: 'At the project midpoint', delivery: 'On final delivery' },
};

/** The brand template's payment options: A 50/50, B in three instalments, C monthly retainer. */
export const PAYMENT_PRESETS: Record<'A' | 'B' | 'C', PaymentPreset> = {
  A: {
    steps: (locale) => [
      { label: STEP_LABELS[locale].signing, percent: 50 },
      { label: STEP_LABELS[locale].delivery, percent: 50 },
    ],
    retainer: false,
  },
  B: {
    steps: (locale) => [
      { label: STEP_LABELS[locale].signing, percent: 33 },
      { label: STEP_LABELS[locale].midpoint, percent: 33 },
      { label: STEP_LABELS[locale].delivery, percent: 34 },
    ],
    retainer: false,
  },
  C: {
    steps: (locale) => [{ label: STEP_LABELS[locale].signing, percent: 100 }],
    retainer: true,
  },
};
