import { describe, expect, it } from 'vitest';
import { DEFAULT_BRIEFING_GUIDE } from '../templates/defaults';
import { parseBriefingDraft } from './parse';
import { createManualAssistant } from './port';
import { buildPrompt } from './prompts';

const TRANSCRIPT =
  'A Ana (ana.costa@empresa.pt, 912 345 678) explicou que os clientes chegam por indicação.';

describe('Core assistant', () => {
  it('briefing prompt carries the guide, transcript and rules', () => {
    const prompt = buildPrompt({
      kind: 'briefing_from_transcript',
      guide: DEFAULT_BRIEFING_GUIDE,
      transcript: TRANSCRIPT,
      applicationAnswers: { sector: 'Consultoria' },
      locale: 'pt-PT',
    });

    for (const block of DEFAULT_BRIEFING_GUIDE.blocks) {
      expect(prompt).toContain(`## ${block.id}`);
      expect(prompt).toContain(block.title['pt-PT']);
    }
    expect(prompt).toContain('os clientes chegam por indicação');
    expect(prompt).toContain('Consultoria');
    expect(prompt).toMatch(/prova/i);
  });

  it('prompt never includes emails or phone numbers', () => {
    const prompt = buildPrompt({
      kind: 'briefing_from_transcript',
      guide: DEFAULT_BRIEFING_GUIDE,
      transcript: TRANSCRIPT,
      applicationAnswers: { contact: 'Ana Costa, ana.costa@empresa.pt, +351 912 345 678' },
      locale: 'pt-PT',
    });

    expect(prompt).not.toContain('ana.costa@empresa.pt');
    expect(prompt).not.toMatch(/912\s?345\s?678/);
  });

  it('keeps the money amounts the client gave', () => {
    const prompt = buildPrompt({
      kind: 'session_narrative',
      findings: [],
      index: [],
      clientNumbers: 'Faturação de 200 000 000 € e 1 500 000 EUR em propostas',
      locale: 'pt-PT',
    });

    expect(prompt).toContain('200 000 000 €');
    expect(prompt).toContain('1 500 000 EUR');
  });

  it('session narrative prompt asks for the four moments', () => {
    const prompt = buildPrompt({
      kind: 'session_narrative',
      findings: [
        {
          front: 'orbit',
          title: 'Formulário falha no telemóvel',
          description: 'Perdem-se pedidos.',
          lane: 'days_30',
          owner: 'internal',
        },
      ],
      index: [{ front: 'orbit', total: 12, max: 25, complete: true }],
      clientNumbers: 'Um cliente vale 15 000 €',
      locale: 'en',
    });

    expect(prompt).toContain('Formulário falha no telemóvel');
    expect(prompt).toContain('12/25');
    expect(prompt).toContain('15 000 €');
    expect(prompt.match(/^## /gm)?.length).toBeGreaterThanOrEqual(4);
  });

  it('parses one section per block', () => {
    const draft = [
      '## brand_today',
      'Consultora de energia com 20 anos.',
      '',
      '## ambition',
      'Abrir Espanha em 2027.',
      '## unknown_block',
      'Ignorado.',
    ].join('\n');

    expect(parseBriefingDraft(draft, DEFAULT_BRIEFING_GUIDE)).toEqual({
      brand_today: 'Consultora de energia com 20 anos.',
      ambition: 'Abrir Espanha em 2027.\n## unknown_block\nIgnorado.',
    });
  });

  it('unrecognised text goes to the first block', () => {
    expect(parseBriefingDraft('  Notas soltas da call.  ', DEFAULT_BRIEFING_GUIDE)).toEqual({
      brand_today: 'Notas soltas da call.',
    });
  });

  it('the manual assistant always returns the prompt', async () => {
    const assistant = createManualAssistant();
    const result = await assistant.draft({
      kind: 'briefing_from_transcript',
      guide: DEFAULT_BRIEFING_GUIDE,
      transcript: 'Texto',
      applicationAnswers: {},
      locale: 'pt-PT',
    });

    expect(result.mode).toBe('manual');
  });
});
