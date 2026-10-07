import type { ApplicationFormDefinition } from './form-definition';

export const DEFAULT_APPLICATION_FORM: ApplicationFormDefinition = {
  questions: [
    {
      id: 'contact',
      kind: 'contact',
      required: true,
      label: { 'pt-PT': 'Nome e email profissional', en: 'Name and work email' },
    },
    {
      id: 'company',
      kind: 'company',
      required: true,
      label: { 'pt-PT': 'Empresa e website', en: 'Company and website' },
    },
    {
      id: 'role',
      kind: 'single_choice',
      required: true,
      label: { 'pt-PT': 'Qual é a sua função?', en: 'What is your role?' },
      options: [
        {
          id: 'ceo_founder_partner',
          label: { 'pt-PT': 'CEO, fundador ou sócio', en: 'CEO, founder or partner' },
          points: 3,
          knockout: false,
        },
        {
          id: 'director',
          label: { 'pt-PT': 'Diretor', en: 'Director' },
          points: 2,
          knockout: false,
        },
        { id: 'other', label: { 'pt-PT': 'Outra', en: 'Other' }, points: 0, knockout: false },
      ],
    },
    {
      id: 'decision_maker_present',
      kind: 'single_choice',
      required: true,
      showIf: { questionId: 'role', optionId: 'other' },
      label: {
        'pt-PT': 'O decisor final vai participar?',
        en: 'Will the final decision maker take part?',
      },
      options: [
        { id: 'yes', label: { 'pt-PT': 'Sim', en: 'Yes' }, points: 0, knockout: false },
        { id: 'no', label: { 'pt-PT': 'Não', en: 'No' }, points: null, knockout: true },
      ],
    },
    {
      id: 'sector',
      kind: 'single_choice',
      required: true,
      label: { 'pt-PT': 'Setor', en: 'Sector' },
      options: [
        {
          id: 'consulting',
          label: { 'pt-PT': 'Consultoria', en: 'Consulting' },
          points: 2,
          knockout: false,
        },
        { id: 'energy', label: { 'pt-PT': 'Energia', en: 'Energy' }, points: 2, knockout: false },
        {
          id: 'technology',
          label: { 'pt-PT': 'Tecnologia', en: 'Technology' },
          points: 2,
          knockout: false,
        },
        { id: 'other', label: { 'pt-PT': 'Outro', en: 'Other' }, points: 0, knockout: false },
      ],
    },
    {
      id: 'revenue',
      kind: 'single_choice',
      required: true,
      label: {
        'pt-PT': 'Faturação anual ou investimento levantado',
        en: 'Annual revenue or funding raised',
      },
      options: [
        {
          id: 'up_to_1m',
          label: { 'pt-PT': 'Até €1M', en: 'Up to €1M' },
          points: 0,
          knockout: false,
        },
        {
          id: '1m_5m',
          label: { 'pt-PT': '€1M a €5M', en: '€1M to €5M' },
          points: 1,
          knockout: false,
        },
        {
          id: '5m_20m',
          label: { 'pt-PT': '€5M a €20M', en: '€5M to €20M' },
          points: 2,
          knockout: false,
        },
        {
          id: 'over_20m',
          label: { 'pt-PT': 'Mais de €20M', en: 'Over €20M' },
          points: 3,
          knockout: false,
        },
      ],
    },
    {
      id: 'priority',
      kind: 'single_choice',
      required: true,
      label: { 'pt-PT': 'O que quer resolver primeiro?', en: 'What do you want to solve first?' },
      options: [
        {
          id: 'decision_maker_meetings',
          label: {
            'pt-PT': 'Gerar reuniões com decisores',
            en: 'Book meetings with decision makers',
          },
          points: null,
          knockout: false,
        },
        {
          id: 'brand_and_site',
          label: { 'pt-PT': 'Reconstruir marca e site', en: 'Rebuild brand and website' },
          points: null,
          knockout: false,
        },
        {
          id: 'integrate_automate',
          label: {
            'pt-PT': 'Integrar ferramentas e automatizar',
            en: 'Integrate tools and automate',
          },
          points: null,
          knockout: false,
        },
        { id: 'other', label: { 'pt-PT': 'Outro', en: 'Other' }, points: null, knockout: false },
      ],
    },
    {
      id: 'investment',
      kind: 'single_choice',
      required: true,
      label: { 'pt-PT': 'Investimento previsto', en: 'Planned investment' },
      options: [
        {
          id: 'under_10k',
          label: { 'pt-PT': 'Menos de €10k', en: 'Under €10k' },
          points: null,
          knockout: true,
        },
        {
          id: '10k_25k',
          label: { 'pt-PT': '€10k a €25k', en: '€10k to €25k' },
          points: 1,
          knockout: false,
        },
        {
          id: '25k_50k',
          label: { 'pt-PT': '€25k a €50k', en: '€25k to €50k' },
          points: 2,
          knockout: false,
        },
        {
          id: 'over_50k',
          label: { 'pt-PT': 'Mais de €50k', en: 'Over €50k' },
          points: 3,
          knockout: false,
        },
      ],
    },
    {
      id: 'timing',
      kind: 'single_choice',
      required: true,
      label: { 'pt-PT': 'Quando quer começar?', en: 'When do you want to start?' },
      options: [
        {
          id: 'this_quarter',
          label: { 'pt-PT': 'Este trimestre', en: 'This quarter' },
          points: 2,
          knockout: false,
        },
        {
          id: 'six_months',
          label: { 'pt-PT': 'Nos próximos 6 meses', en: 'In the next 6 months' },
          points: 1,
          knockout: false,
        },
        {
          id: 'exploring',
          label: { 'pt-PT': 'Estou a explorar', en: 'Just exploring' },
          points: 0,
          knockout: false,
        },
      ],
    },
    {
      id: 'cost_of_inaction',
      kind: 'long_text',
      required: true,
      label: {
        'pt-PT': 'O que lhe custa não resolver isto nos próximos 12 meses?',
        en: 'What does it cost you not to solve this in the next 12 months?',
      },
    },
  ],
  thresholds: { a: 9, b: 6 },
};
