import type { FindingOwner, OrbitFront, RoadmapLane } from '@agency-os/db';
import type { Locale } from '@agency-os/i18n';
import type { OrbitIndexRow } from '../domain/orbit-index';
import type { BriefingGuide } from '../templates/definitions';

export type NarrativeFinding = {
  front: OrbitFront;
  title: string;
  description: string;
  lane: RoadmapLane;
  owner: FindingOwner;
};

export type CoreAssistantRequest =
  | {
      kind: 'briefing_from_transcript';
      guide: BriefingGuide;
      transcript: string;
      applicationAnswers: Record<string, string>;
      locale: Locale;
    }
  | {
      kind: 'session_narrative';
      findings: NarrativeFinding[];
      index: OrbitIndexRow[];
      clientNumbers: string;
      locale: Locale;
    };

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE =
  /(?<![\d€$£])(?:\+\d{1,3}[\s-]?)?\d(?:[\s-]?\d){8,}(?![\d\s]*(?:€|EUR|USD|GBP|%|\$|£))/g;

/** Contact details never leave the OS in a prompt; the model does not need them. */
export function redactContactDetails(text: string, locale: Locale): string {
  const phone = locale === 'pt-PT' ? '[telefone]' : '[phone]';
  return text.replace(EMAIL, '[email]').replace(PHONE, phone);
}

const COPY = {
  'pt-PT': {
    rules: [
      'Regras:',
      '- Nada entra sem prova: usa só o que está na transcrição, nas respostas ou nos achados.',
      '- Usa os números que o cliente deu, nunca médias de mercado.',
      '- Nenhuma frase pode aplicar-se igualmente a outra empresa do mesmo setor.',
      '- Escreve em português de Portugal, frases curtas, sem pontos de exclamação.',
    ],
    briefingIntro:
      'És o assistente da Aurion. Resume a call Aurion Core abaixo no briefing do cliente, bloco a bloco.',
    briefingFormat:
      'Responde só com os blocos, cada um a começar pela linha "## <identificador do bloco>" exatamente como abaixo.',
    blocks: 'Blocos e perguntas-guia:',
    answers: 'Respostas da candidatura:',
    transcript: 'Transcrição da call:',
    narrativeIntro:
      'És o assistente da Aurion. Escreve o guião da sessão de proposta Aurion Core a partir da auditoria.',
    narrativeFormat: 'Responde com quatro secções, por esta ordem:',
    moments: [
      '## Onde estão — o Índice Orbit e o que o explica',
      '## O que isso custa — os problemas traduzidos em contactos perdidos e perceção de valor',
      '## O que proponho — o roadmap nas três faixas',
      '## Decisão — o que acontece a seguir e quando',
    ],
    findings: 'Achados (frente · faixa · responsável):',
    index: 'Índice Orbit:',
    numbers: 'Números dados pelo cliente:',
    lanes: { days_30: '30 dias', days_90: '90 dias', months_12: '12 meses' },
    owners: { internal: 'interno', aurion: 'Aurion' },
  },
  en: {
    rules: [
      'Rules:',
      '- Nothing goes in without evidence: use only the transcript, the answers or the findings.',
      '- Use the numbers the client gave, never market averages.',
      '- No sentence may apply equally to another company in the same sector.',
      '- Write short sentences, without exclamation marks.',
    ],
    briefingIntro:
      'You are the Aurion assistant. Summarise the Aurion Core call below into the client briefing, block by block.',
    briefingFormat:
      'Reply with the blocks only, each starting with the line "## <block identifier>" exactly as below.',
    blocks: 'Blocks and guide questions:',
    answers: 'Application answers:',
    transcript: 'Call transcript:',
    narrativeIntro:
      'You are the Aurion assistant. Write the script of the Aurion Core proposal session from the audit.',
    narrativeFormat: 'Reply with four sections, in this order:',
    moments: [
      '## Where they are — the Orbit Index and what explains it',
      '## What it costs — the problems translated into lost leads and perceived value',
      '## What I propose — the roadmap in three lanes',
      '## Decision — what happens next and when',
    ],
    findings: 'Findings (front · lane · owner):',
    index: 'Orbit Index:',
    numbers: 'Numbers given by the client:',
    lanes: { days_30: '30 days', days_90: '90 days', months_12: '12 months' },
    owners: { internal: 'internal', aurion: 'Aurion' },
  },
} as const;

export function buildPrompt(request: CoreAssistantRequest): string {
  const copy = COPY[request.locale];
  const redact = (text: string) => redactContactDetails(text, request.locale);

  if (request.kind === 'briefing_from_transcript') {
    const blocks = request.guide.blocks.flatMap((block) => [
      `## ${block.id}`,
      `${block.title[request.locale]} — ${block.goal[request.locale]}`,
      ...block.questions.map((question) => `- ${question.text[request.locale]}`),
      '',
    ]);
    const answers = Object.entries(request.applicationAnswers).map(
      ([key, value]) => `- ${key}: ${redact(value)}`,
    );
    return [
      copy.briefingIntro,
      copy.briefingFormat,
      '',
      ...copy.rules,
      '',
      copy.blocks,
      ...blocks,
      copy.answers,
      ...(answers.length > 0 ? answers : ['-']),
      '',
      copy.transcript,
      redact(request.transcript),
    ].join('\n');
  }

  return [
    copy.narrativeIntro,
    copy.narrativeFormat,
    ...copy.moments,
    '',
    ...copy.rules,
    '',
    copy.index,
    ...request.index.map((row) => `- ${row.front}: ${row.total}/${row.max}`),
    '',
    copy.findings,
    ...request.findings.map(
      (finding) =>
        `- ${finding.front} · ${copy.lanes[finding.lane]} · ${copy.owners[finding.owner]}: ${redact(finding.title)}. ${redact(finding.description)}`,
    ),
    '',
    copy.numbers,
    redact(request.clientNumbers),
  ].join('\n');
}
