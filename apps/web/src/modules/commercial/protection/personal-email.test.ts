import { describe, expect, it } from 'vitest';
import { isPersonalEmail } from './personal-email';

describe('isPersonalEmail', () => {
  it('detects personal providers case-insensitively', () => {
    expect(isPersonalEmail('ana@gmail.com')).toBe(true);
    expect(isPersonalEmail('Ana@HOTMAIL.com')).toBe(true);
    expect(isPersonalEmail(' joao@sapo.pt ')).toBe(true);
    expect(isPersonalEmail('rui@proton.me')).toBe(true);
  });

  it('accepts company domains', () => {
    expect(isPersonalEmail('ana@empresa.pt')).toBe(false);
    expect(isPersonalEmail('ana@gmail.com.empresa.pt')).toBe(false);
    expect(isPersonalEmail('not-an-email')).toBe(false);
  });
});
