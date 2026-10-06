export {
  normalizeEmail,
  readClaims,
  type AuthPort,
  type IdentityDeps,
  type UserKind,
} from './auth-port';
export { BreachCheckUnavailableError, HIBP_TIMEOUT_MS, isPwnedPassword } from './hibp';
export { requestMagicLink } from './magic-link';
export { enrollTotp, verifyTotp, type TotpEnrollment, type VerifyTotpResult } from './mfa';
export {
  MINIMUM_PASSWORD_LENGTH,
  validatePassword,
  type PasswordValidation,
} from './password-policy';
export { REAUTHENTICATION_WINDOW_MS, requireRecentMfa, type RecentMfaResult } from './reauth';
export {
  auditForClaims,
  callbackPath,
  clearActivity,
  createIdentityDeps,
  lookupUserKindByEmail,
  startActivity,
} from './server';
export { signInWithPassword, type SignInResult } from './sign-in';
