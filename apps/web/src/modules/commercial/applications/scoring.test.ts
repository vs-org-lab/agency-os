import { describe, expect, it } from 'vitest';
import { DEFAULT_APPLICATION_FORM } from './default-form';
import { maxScore } from './form-definition';
import { answersSchemaFor, scoreApplication, type ApplicationAnswers } from './scoring';

function answers(choices: Record<string, string>): ApplicationAnswers {
  return {
    contact: { fullName: 'Ana Costa', email: 'ana@empresa.pt' },
    company: { name: 'Empresa', website: 'https://empresa.pt' },
    choices: {
      role: 'ceo_founder_partner',
      sector: 'consulting',
      revenue: 'over_20m',
      priority: 'brand_and_site',
      investment: 'over_50k',
      timing: 'this_quarter',
      ...choices,
    },
    texts: { cost_of_inaction: 'Perdemos dois contratos por ano.' },
  };
}

describe('scoreApplication', () => {
  it('default form scores a maximum of 13', () => {
    expect(maxScore(DEFAULT_APPLICATION_FORM)).toBe(13);
  });

  it('maximum answers route to path a', () => {
    expect(scoreApplication(DEFAULT_APPLICATION_FORM, answers({}))).toEqual({
      score: 13,
      path: 'a',
      knockouts: [],
    });
  });

  it('score 9 without knockouts routes to a', () => {
    const result = scoreApplication(
      DEFAULT_APPLICATION_FORM,
      answers({
        role: 'director',
        revenue: '5m_20m',
        investment: '10k_25k',
        timing: 'this_quarter',
      }),
    );
    expect(result).toEqual({ score: 9, path: 'a', knockouts: [] });
  });

  it('score 8 routes to b', () => {
    const result = scoreApplication(
      DEFAULT_APPLICATION_FORM,
      answers({ role: 'director', revenue: '5m_20m', investment: '10k_25k', timing: 'six_months' }),
    );
    expect(result).toEqual({ score: 8, path: 'b', knockouts: [] });
  });

  it('score 6 routes to b', () => {
    const result = scoreApplication(
      DEFAULT_APPLICATION_FORM,
      answers({
        role: 'director',
        sector: 'other',
        revenue: '1m_5m',
        investment: '10k_25k',
        timing: 'this_quarter',
      }),
    );
    expect(result).toEqual({ score: 6, path: 'b', knockouts: [] });
  });

  it('score 5 routes to c', () => {
    const result = scoreApplication(
      DEFAULT_APPLICATION_FORM,
      answers({
        role: 'director',
        sector: 'other',
        revenue: '1m_5m',
        investment: '10k_25k',
        timing: 'six_months',
      }),
    );
    expect(result).toEqual({ score: 5, path: 'c', knockouts: [] });
  });

  it('investment under 10k routes to c regardless of score', () => {
    const result = scoreApplication(DEFAULT_APPLICATION_FORM, answers({ investment: 'under_10k' }));
    expect(result.path).toBe('c');
    expect(result.knockouts).toEqual(['investment']);
  });

  it('absent decision maker routes to c', () => {
    const result = scoreApplication(
      DEFAULT_APPLICATION_FORM,
      answers({ role: 'other', decision_maker_present: 'no' }),
    );
    expect(result.path).toBe('c');
    expect(result.knockouts).toEqual(['decision_maker_present']);
  });

  it('ignores the decision maker question when role is not other', () => {
    const result = scoreApplication(
      DEFAULT_APPLICATION_FORM,
      answers({ role: 'ceo_founder_partner', decision_maker_present: 'no' }),
    );
    expect(result).toEqual({ score: 13, path: 'a', knockouts: [] });
  });
});

describe('answersSchemaFor', () => {
  const schema = answersSchemaFor(DEFAULT_APPLICATION_FORM);

  it('accepts a complete set of answers', () => {
    expect(schema.safeParse(answers({})).success).toBe(true);
  });

  it('rejects unknown option ids and missing required answers', () => {
    expect(schema.safeParse(answers({ sector: 'mining' })).success).toBe(false);
    const missing = answers({});
    delete missing.choices.timing;
    expect(schema.safeParse(missing).success).toBe(false);
  });

  it('requires the decision maker answer only when role is other', () => {
    expect(schema.safeParse(answers({ role: 'other' })).success).toBe(false);
    expect(
      schema.safeParse(answers({ role: 'other', decision_maker_present: 'yes' })).success,
    ).toBe(true);
  });

  it('rejects an invalid email and text over 2000 characters', () => {
    const invalidEmail = answers({});
    invalidEmail.contact.email = 'not-an-email';
    expect(schema.safeParse(invalidEmail).success).toBe(false);
    const longText = answers({});
    longText.texts.cost_of_inaction = 'x'.repeat(2001);
    expect(schema.safeParse(longText).success).toBe(false);
  });
});
