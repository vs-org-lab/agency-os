import type { BriefingGuide, OnboardingRequest } from './definitions';

/** The yes-or-no question of the default guide that the brand files request follows. */
export const VISUAL_IDENTITY_QUESTION_ID = 'has_visual_identity';

/**
 * The onboarding requests the agency usually needs, by what the client said and what they
 * contracted. Access requests ask to invite the agency's email and never for a password (SEC).
 */
export const SUGGESTED_ONBOARDING_REQUESTS: readonly OnboardingRequest[] = [
  {
    id: 'brand_files',
    kind: 'upload',
    title: {
      'pt-PT': 'Envie os ficheiros da sua identidade visual',
      en: 'Send us your visual identity files',
    },
    body: {
      'pt-PT':
        'Logótipo em vetor (SVG, AI ou PDF), manual de marca, tipos de letra e cores. Envie o que tiver, tal como está.',
      en: 'Logo in vector format (SVG, AI or PDF), brand guidelines, typefaces and colours. Send what you have, as it is.',
    },
    when: { type: 'answer', questionId: VISUAL_IDENTITY_QUESTION_ID, equals: 'yes' },
  },
  {
    id: 'references',
    kind: 'text',
    title: {
      'pt-PT': 'Partilhe três a cinco referências de que gosta',
      en: 'Share three to five references you like',
    },
    body: {
      'pt-PT':
        'Marcas, sites ou campanhas, de qualquer setor, com uma linha sobre o que lhe agrada em cada uma.',
      en: 'Brands, websites or campaigns from any sector, with a line on what you like about each.',
    },
    when: { type: 'always' },
  },
  {
    id: 'content_assets',
    kind: 'upload',
    title: {
      'pt-PT': 'Envie o vídeo e a fotografia que já tem',
      en: 'Send the video and photography you already have',
    },
    body: {
      'pt-PT':
        'Material da equipa, do espaço e dos produtos que possamos usar. Ficheiros grandes podem ir por partes.',
      en: 'Footage and photos of your team, place and products we can use. Large files can go in parts.',
    },
    when: { type: 'module', code: 'A' },
  },
  {
    id: 'social_access',
    kind: 'access',
    title: {
      'pt-PT': 'Dê-nos acesso às suas redes sociais',
      en: 'Give us access to your social accounts',
    },
    body: {
      'pt-PT':
        'Adicione o email da agência como administrador ou editor em cada conta (Meta Business Suite, LinkedIn, TikTok). Nunca nos envie palavras-passe.',
      en: 'Add the agency email as an admin or editor on each account (Meta Business Suite, LinkedIn, TikTok). Never send us passwords.',
    },
    when: { type: 'module', code: 'B' },
  },
  {
    id: 'ads_access',
    kind: 'access',
    title: {
      'pt-PT': 'Dê-nos acesso às contas de anúncios',
      en: 'Give us access to your ad accounts',
    },
    body: {
      'pt-PT':
        'Adicione o email da agência como anunciante no Meta Business Manager e no Google Ads. A faturação dos anúncios continua no seu nome. Nunca nos envie palavras-passe.',
      en: 'Add the agency email as an advertiser in Meta Business Manager and Google Ads. Ad billing stays in your name. Never send us passwords.',
    },
    when: { type: 'module', code: 'C' },
  },
  {
    id: 'web_details',
    kind: 'text',
    title: {
      'pt-PT': 'Conte-nos sobre o seu site e o seu domínio',
      en: 'Tell us about your website and domain',
    },
    body: {
      'pt-PT':
        'Onde está registado o domínio, onde está alojado o site atual e quem o gere. Se o registo permitir, convide o email da agência como colaborador.',
      en: 'Where the domain is registered, where the current site is hosted and who runs it. If the registrar allows it, invite the agency email as a collaborator.',
    },
    when: { type: 'module', code: 'D' },
  },
  {
    id: 'automation_tools',
    kind: 'text',
    title: {
      'pt-PT': 'Que ferramentas usa hoje?',
      en: 'Which tools do you use today?',
    },
    body: {
      'pt-PT':
        'As ferramentas que as automações devem ligar (CRM, email, faturação, formulários) e quem é o responsável por cada uma.',
      en: 'The tools the automations should connect (CRM, email, invoicing, forms) and who owns each one.',
    },
    when: { type: 'module', code: 'E' },
  },
];

/**
 * The guide with the suggested requests it does not have yet. The brand files request follows the
 * visual identity question when the guide asks it as a yes-or-no, and is asked of everyone otherwise.
 */
export function withSuggestedRequests(guide: BriefingGuide): BriefingGuide {
  const asksIdentity = guide.blocks.some((block) =>
    block.questions.some(
      (question) =>
        question.id === VISUAL_IDENTITY_QUESTION_ID && question.answer?.kind === 'yes_no',
    ),
  );
  const present = new Set(guide.onboarding.map((request) => request.id));
  const added = SUGGESTED_ONBOARDING_REQUESTS.filter((request) => !present.has(request.id)).map(
    (request): OnboardingRequest =>
      request.when.type === 'answer' && !asksIdentity
        ? { ...request, when: { type: 'always' } }
        : request,
  );
  return { ...guide, onboarding: [...guide.onboarding, ...added] };
}
