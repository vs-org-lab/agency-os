import type { BriefingGuide, OrbitGrid } from './definitions';

/** The "Guia de perguntas" of the Aurion Core script: the four call blocks. */
export const DEFAULT_BRIEFING_GUIDE: BriefingGuide = {
  blocks: [
    {
      id: 'brand_today',
      title: { 'pt-PT': 'A marca hoje', en: 'The brand today' },
      minutes: 15,
      goal: {
        'pt-PT': 'O que a empresa é, como se descreve, o que a distingue de facto',
        en: 'What the company is, how it describes itself, what truly sets it apart',
      },
      questions: [
        {
          id: 'first_description',
          text: {
            'pt-PT': 'Como descreves a empresa a alguém que a ouve pela primeira vez?',
            en: 'How do you describe the company to someone hearing about it for the first time?',
          },
        },
        {
          id: 'unique_strength',
          text: {
            'pt-PT':
              'O que é que vocês fazem bem que os vossos concorrentes não fazem? E os vossos clientes sabem disso?',
            en: 'What do you do well that your competitors do not? Do your clients know it?',
          },
        },
        {
          id: 'ideal_client',
          text: {
            'pt-PT':
              'Qual é o cliente que gostavam de ter mais vezes, e porque é que ainda não têm?',
            en: 'Which client would you like to have more often, and why do you not have them yet?',
          },
        },
        {
          id: 'market_gap',
          text: {
            'pt-PT': 'Se amanhã a empresa desaparecesse, o que é que faltaria ao mercado?',
            en: 'If the company disappeared tomorrow, what would the market miss?',
          },
        },
        {
          id: 'last_big_client',
          text: {
            'pt-PT':
              'Pensem no último cliente grande que fecharam: como é que ele vos encontrou, desde o início?',
            en: 'Think of the last big client you closed: how did they find you, from the start?',
          },
        },
        {
          id: 'buyer_comparison',
          text: {
            'pt-PT': 'O que é que um comprador vosso compara antes de vos escolher?',
            en: 'What does your buyer compare before choosing you?',
          },
        },
        {
          id: 'lost_deals',
          text: {
            'pt-PT':
              'Quando perdem um negócio para um concorrente, qual é normalmente a razão que vos dão?',
            en: 'When you lose a deal to a competitor, what reason are you usually given?',
          },
        },
      ],
    },
    {
      id: 'ambition',
      title: { 'pt-PT': 'Onde quer chegar', en: 'Where it wants to go' },
      minutes: 15,
      goal: {
        'pt-PT': 'Ambição a 12-24 meses, mercados, perceção que quer construir',
        en: 'Ambition for 12 to 24 months, markets, the perception it wants to build',
      },
      questions: [
        {
          id: 'next_24_months',
          text: {
            'pt-PT':
              'Se os próximos 24 meses correrem muito bem, o que mudou concretamente no negócio?',
            en: 'If the next 24 months go very well, what has concretely changed in the business?',
          },
        },
        {
          id: 'new_markets',
          text: {
            'pt-PT': 'Que mercados, segmentos ou tipos de cliente querem abrir?',
            en: 'Which markets, segments or kinds of client do you want to open?',
          },
        },
        {
          id: 'desired_word',
          text: {
            'pt-PT':
              'Quando alguém de fora olhar para vocês daqui a dois anos, que palavra querem que use?',
            en: 'When an outsider looks at you two years from now, which word do you want them to use?',
          },
        },
        {
          id: 'main_constraint',
          text: {
            'pt-PT':
              'O que vos trava hoje: não chegam leads, não fecham os que chegam, ou não conseguem entregar mais?',
            en: 'What holds you back today: leads do not arrive, you do not close them, or you cannot deliver more?',
          },
        },
      ],
    },
    {
      id: 'communication',
      title: { 'pt-PT': 'Como tem comunicado', en: 'How it has communicated' },
      minutes: 15,
      goal: {
        'pt-PT': 'O que já fizeram, com quem, o que resultou e o que não',
        en: 'What they have done, with whom, what worked and what did not',
      },
      questions: [
        {
          id: 'reference_brand',
          text: {
            'pt-PT':
              'Há alguma marca, do vosso setor ou de outro, cuja presença vos faz pensar "era isto que queríamos parecer"?',
            en: 'Is there a brand, in your sector or another, whose presence makes you think "this is how we want to look"?',
          },
        },
        {
          id: 'failed_attempts',
          text: {
            'pt-PT': 'O que já tentaram em digital e não pegou, e porquê, na vossa leitura?',
            en: 'What have you tried in digital that did not work, and why, in your view?',
          },
        },
        {
          id: 'publishing_owner',
          text: {
            'pt-PT': 'Quem decide hoje o que se publica e quem o executa?',
            en: 'Who decides today what gets published, and who executes it?',
          },
        },
        {
          id: 'untouchables',
          text: {
            'pt-PT':
              'Há alguma coisa que não se pode tocar: um sistema, um fornecedor, uma decisão já tomada?',
            en: 'Is there anything that cannot be touched: a system, a supplier, a decision already made?',
          },
        },
      ],
    },
    {
      id: 'observations',
      title: { 'pt-PT': 'Observações e fecho', en: 'Observations and close' },
      minutes: 15,
      goal: {
        'pt-PT': 'Três observações nossas, a reação a cada uma, e o próximo passo',
        en: 'Three observations of ours, the reaction to each, and the next step',
      },
      questions: [
        {
          id: 'surprise',
          text: {
            'pt-PT':
              'Esta é a vossa empresa vista por um comprador que não vos conhece. Isto surpreende-vos?',
            en: 'This is your company seen by a buyer who does not know you. Does it surprise you?',
          },
        },
        {
          id: 'known_or_new',
          text: {
            'pt-PT': 'Isto é novidade, ou é conhecido e nunca chegou a cima da lista?',
            en: 'Is this new, or known and never made it to the top of the list?',
          },
        },
        {
          id: 'other_approvers',
          text: {
            'pt-PT': 'Quem mais tem de dizer que sim, além de ti?',
            en: 'Who else has to say yes, besides you?',
          },
        },
      ],
    },
  ],
};

type CriterionSeed = [
  id: string,
  ptName: string,
  enName: string,
  ptObserves: string,
  enObserves: string,
];

function criteria(seeds: CriterionSeed[]): OrbitGrid['fronts'][number]['criteria'] {
  return seeds.map(([id, ptName, enName, ptObserves, enObserves]) => ({
    id,
    name: { 'pt-PT': ptName, en: enName },
    observes: { 'pt-PT': ptObserves, en: enObserves },
    maxPoints: 5,
  }));
}

/** Initial Orbit Index grid derived from the "O que se audita" column of the Aurion Core script. */
export const DEFAULT_ORBIT_GRID: OrbitGrid = {
  fronts: [
    {
      front: 'core',
      criteria: criteria([
        [
          'value_proposition',
          'Clareza da proposta de valor',
          'Value proposition clarity',
          'Se a proposta se percebe em segundos',
          'Whether the proposition is understood in seconds',
        ],
        [
          'site_coherence',
          'Coerência do site',
          'Website coherence',
          'O site diz o mesmo que a empresa',
          'The website says what the company says',
        ],
        [
          'proposal_coherence',
          'Coerência das propostas',
          'Proposal coherence',
          'Propostas alinhadas com a marca',
          'Proposals aligned with the brand',
        ],
        [
          'social_coherence',
          'Coerência das redes',
          'Social coherence',
          'Redes alinhadas com a marca',
          'Social channels aligned with the brand',
        ],
        [
          'visual_identity',
          'Identidade visual',
          'Visual identity',
          'Consistência e qualidade da identidade',
          'Consistency and quality of the identity',
        ],
      ]),
    },
    {
      front: 'orbit',
      criteria: criteria([
        ['site_speed', 'Velocidade', 'Speed', 'Tempo de carregamento do site', 'Website load time'],
        [
          'mobile_experience',
          'Experiência mobile',
          'Mobile experience',
          'Uso do site no telemóvel',
          'Website use on a phone',
        ],
        [
          'conversion_paths',
          'Estrutura e percursos de conversão',
          'Structure and conversion paths',
          'Do primeiro clique ao pedido de contacto',
          'From the first click to the contact request',
        ],
        [
          'content_video_motion',
          'Conteúdo, vídeo e motion',
          'Content, video and motion',
          'Qualidade e regularidade do conteúdo',
          'Quality and regularity of content',
        ],
        [
          'social_channels',
          'Redes',
          'Social channels',
          'Presença e atividade nas redes',
          'Presence and activity on social channels',
        ],
      ]),
    },
    {
      front: 'gravity',
      criteria: criteria([
        [
          'active_campaigns',
          'Campanhas ativas',
          'Active campaigns',
          'Campanhas em curso e a sua lógica',
          'Running campaigns and their logic',
        ],
        [
          'tracking_events',
          'Rastreamento e eventos',
          'Tracking and events',
          'Medição de visitas e conversões',
          'Measurement of visits and conversions',
        ],
        [
          'forms',
          'Formulários',
          'Forms',
          'Formulários que funcionam e convertem',
          'Forms that work and convert',
        ],
        [
          'lead_response_time',
          'Tempo de resposta a leads',
          'Lead response time',
          'Quanto demora a primeira resposta',
          'How long the first response takes',
        ],
        [
          'automations',
          'Automações',
          'Automations',
          'Seguimento automático de contactos',
          'Automatic follow-up of contacts',
        ],
      ]),
    },
    {
      front: 'constellation',
      criteria: criteria([
        [
          'leader_presence',
          'Presença dos líderes',
          'Leader presence',
          'Visibilidade de quem lidera',
          'Visibility of the people in charge',
        ],
        [
          'owned_content',
          'Conteúdo próprio',
          'Owned content',
          'Conteúdo original com ponto de vista',
          'Original content with a point of view',
        ],
        ['press', 'Imprensa', 'Press', 'Menções e artigos', 'Mentions and articles'],
        [
          'social_proof',
          'Prova social',
          'Social proof',
          'Casos, testemunhos e números',
          'Cases, testimonials and numbers',
        ],
        [
          'competitive_position',
          'Posição face aos concorrentes',
          'Position against competitors',
          'Comparação com os três concorrentes indicados',
          'Comparison with the three named competitors',
        ],
      ]),
    },
  ],
};
