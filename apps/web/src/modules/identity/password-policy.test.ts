import { describe, expect, it, vi } from 'vitest';
import { MINIMUM_PASSWORD_LENGTH, validatePassword } from './password-policy';

describe('validatePassword', () => {
  it('rejects 11 characters and accepts 12', async () => {
    const isPwned = vi.fn().mockResolvedValue(false);

    expect(MINIMUM_PASSWORD_LENGTH).toBe(12);
    expect(await validatePassword('a'.repeat(11), { isPwned })).toEqual({
      ok: false,
      reason: 'too_short',
    });
    expect(await validatePassword('a'.repeat(12), { isPwned })).toEqual({ ok: true });
  });

  it('counts characters rather than UTF-16 code units', async () => {
    const isPwned = vi.fn().mockResolvedValue(false);

    expect(await validatePassword('🔒'.repeat(11), { isPwned })).toEqual({
      ok: false,
      reason: 'too_short',
    });
  });

  it('does not call the breach check for short passwords', async () => {
    const isPwned = vi.fn();
    await validatePassword('short', { isPwned });

    expect(isPwned).not.toHaveBeenCalled();
  });

  it('rejects breached passwords', async () => {
    expect(await validatePassword('correct horse battery', { isPwned: async () => true })).toEqual({
      ok: false,
      reason: 'pwned',
    });
  });

  it('reports check_unavailable when the breach check fails', async () => {
    const isPwned = vi.fn().mockRejectedValue(new Error('timeout'));

    expect(await validatePassword('correct horse battery', { isPwned })).toEqual({
      ok: false,
      reason: 'check_unavailable',
    });
  });
});
