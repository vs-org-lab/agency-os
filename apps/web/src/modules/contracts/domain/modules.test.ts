import { describe, expect, it } from 'vitest';
import { moduleClauses, parseModules, PAYMENT_PRESETS, type ContractModule } from './modules';

const VIDEO: ContractModule = { code: 'A', params: { videosPerMonth: 8, revisions: 2 } };
const SOCIAL: ContractModule = {
  code: 'B',
  params: { platforms: ['instagram', 'linkedin'], feedPosts: 12, storiesPerWeek: 5 },
};

describe('parseModules', () => {
  it('accepts each module with its own parameters', () => {
    expect(
      parseModules([
        VIDEO,
        SOCIAL,
        {
          code: 'C',
          params: { platforms: ['meta'], mediaBudget: '1500', managementFee: '450.50' },
        },
        {
          code: 'D',
          params: {
            solution: 'ecommerce',
            technologies: 'Next.js',
            hosting: true,
            sourceCode: false,
          },
        },
        { code: 'E', params: { tools: ['n8n', 'openai'], maintenanceMonths: 3 } },
      ]),
    ).toHaveLength(5);
  });

  it('refuses unknown codes, repeated modules and values outside the closed lists', () => {
    for (const rejected of [
      [{ code: 'F', params: {} }],
      [VIDEO, VIDEO],
      [{ code: 'B', params: { ...SOCIAL.params, platforms: ['myspace'] } }],
      [{ code: 'A', params: { videosPerMonth: -1, revisions: 2 } }],
      [{ code: 'C', params: { platforms: [], mediaBudget: '1', managementFee: '1' } }],
      [
        {
          code: 'D',
          params: {
            solution: 'website',
            technologies: 'x'.repeat(121),
            hosting: true,
            sourceCode: true,
          },
        },
      ],
    ]) {
      expect(parseModules(rejected), JSON.stringify(rejected)).toBeNull();
    }
  });
});

describe('moduleClauses', () => {
  it('writes each chosen module with its parameters', () => {
    const text = moduleClauses([VIDEO, SOCIAL], 'pt-PT', 'EUR');
    expect(text).toContain('### Módulo A — Vídeo e motion graphics');
    expect(text).toContain('Volume contratado: 8 vídeos por mês.');
    expect(text).toContain('Revisões incluídas: 2 rondas por entregável.');
    expect(text).toContain('### Módulo B — Gestão de redes sociais');
    expect(text).toContain('Plataformas incluídas: Instagram, LinkedIn.');
    expect(text).toContain('### Solução integrada');
  });

  it('formats money in the proposal currency', () => {
    const text = moduleClauses(
      [
        {
          code: 'C',
          params: { platforms: ['google'], mediaBudget: '1500', managementFee: '450.5' },
        },
      ],
      'pt-PT',
      'EUR',
    );
    expect(text).toContain('Orçamento de media mensal: 1500,00');
    expect(text).not.toContain('Solução integrada');
  });

  it('is empty without modules', () => {
    expect(moduleClauses([], 'en', 'EUR')).toBe('');
  });
});

describe('PAYMENT_PRESETS', () => {
  it('each preset adds up to the whole amount', () => {
    for (const preset of Object.values(PAYMENT_PRESETS)) {
      expect(preset.steps('pt-PT').reduce((sum, step) => sum + step.percent, 0)).toBe(100);
    }
    expect(PAYMENT_PRESETS.B.steps('pt-PT').map((step) => step.percent)).toEqual([33, 33, 34]);
    expect(PAYMENT_PRESETS.C.retainer).toBe(true);
  });
});
