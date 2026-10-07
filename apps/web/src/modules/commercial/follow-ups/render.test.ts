import { describe, expect, it } from 'vitest';
import { DEFAULT_FOLLOW_UP_TEMPLATES } from './default-templates';
import { renderFollowUpMessage } from './render';

describe('renderFollowUpMessage', () => {
  it('fills known placeholders and keeps unknown ones', () => {
    expect(
      renderFollowUpMessage('Olá {firstName}, sobre a {companyName} ({callDate}) {other}', {
        firstName: 'Ana',
        companyName: 'Empresa Exemplo',
        callDate: '13 de outubro',
      }),
    ).toBe('Olá Ana, sobre a Empresa Exemplo (13 de outubro) {other}');
  });

  it('provides a default template for every day in both locales', () => {
    for (const locale of ['pt-PT', 'en'] as const) {
      expect(
        DEFAULT_FOLLOW_UP_TEMPLATES.filter((template) => template.locale === locale)
          .map((template) => template.sequenceDay)
          .sort((first, second) => first - second),
      ).toEqual([3, 7, 14, 30]);
    }
  });
});
