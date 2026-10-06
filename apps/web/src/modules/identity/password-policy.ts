export const MINIMUM_PASSWORD_LENGTH = 12;

export type PasswordValidation =
  { ok: true } | { ok: false; reason: 'too_short' | 'pwned' | 'check_unavailable' };

export async function validatePassword(
  password: string,
  deps: { isPwned: (password: string) => Promise<boolean> },
): Promise<PasswordValidation> {
  if ([...password].length < MINIMUM_PASSWORD_LENGTH) return { ok: false, reason: 'too_short' };

  try {
    if (await deps.isPwned(password)) return { ok: false, reason: 'pwned' };
  } catch {
    return { ok: false, reason: 'check_unavailable' };
  }

  return { ok: true };
}
