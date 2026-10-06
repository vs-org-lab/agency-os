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
  acceptInvitationForUser,
  auditForClaims,
  canManageAccount,
  callbackPath,
  clearActivity,
  createChangePasswordDeps,
  createIdentityDeps,
  createInvitationDeps,
  createSetPasswordDeps,
  lookupUserKindByEmail,
  sessionDeps,
  startActivity,
} from './server';
export { signInWithPassword, type SignInResult } from './sign-in';
export { createSupabaseAdminPort } from './admin';
export {
  acceptInvitation,
  bootstrapFounder,
  inviteClientUser,
  inviteTeamMember,
  lookupUserIdByEmail,
  organizationSlug,
  type AdminPort,
  type BootstrapResult,
  type ClientInvitationInput,
  type InvitationDeps,
  type InvitationResult,
  type Session,
  type TeamInvitationInput,
} from './invitations';
export { setPassword, type SetPasswordDeps, type SetPasswordResult } from './set-password';
export { changePassword, listSessions, revokeSession, type ActiveSession } from './sessions';
export { accountActionAllowed } from './account-assurance';
