import { describe, expect, it } from 'vitest';
import { schema } from '@agency-os/db';
import { currencies } from '@agency-os/i18n';

describe('currencies', () => {
  it('keeps the database enum and the formatted currencies in step', () => {
    expect([...schema.currencyEnum.enumValues].sort()).toEqual([...currencies].sort());
    expect(currencies).toContain('AOA');
  });
});
