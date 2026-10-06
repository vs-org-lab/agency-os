import { normalizeEmail, type IdentityDeps } from './auth-port';

export async function requestMagicLink(
  input: { email: string },
  deps: Pick<IdentityDeps, 'auth' | 'lookupUserKind' | 'magicLinkRedirectUrl'>,
): Promise<{ sent: true }> {
  const email = normalizeEmail(input.email);

  if ((await deps.lookupUserKind(email)) === 'client') {
    try {
      await deps.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: deps.magicLinkRedirectUrl },
      });
    } catch {
      return { sent: true };
    }
  }

  return { sent: true };
}
