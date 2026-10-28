export const INTERNAL_ROLES = ['founder', 'project_manager', 'freelancer', 'finance'] as const;
export const CLIENT_ROLES = ['decision_maker', 'operational', 'client_finance'] as const;
export const ROLES = [...INTERNAL_ROLES, 'agent', ...CLIENT_ROLES] as const;

export const RESOURCES = [
  'pipeline',
  'rooms',
  'commercial_values',
  'invoices',
  'library',
  'onboarding',
  'brand_hub',
  'vault',
  'users',
  'audit_log',
] as const;

export const ACTIONS = ['read', 'write', 'approve', 'draft', 'pay', 'publish', 'invite'] as const;

export const SCOPES = ['all', 'own', 'own_room'] as const;

export type InternalRole = (typeof INTERNAL_ROLES)[number];
export type ClientRole = (typeof CLIENT_ROLES)[number];
export type Role = (typeof ROLES)[number];
export type Resource = (typeof RESOURCES)[number];
export type Action = (typeof ACTIONS)[number];
export type Scope = (typeof SCOPES)[number];

export type Permission = { action: Action; scope: Scope };

export type Actor = {
  userId: string;
  organizationId: string;
  roles: Array<InternalRole | 'agent'>;
  mfaVerifiedAt: Date | null;
};

export type ResourceRef = { type: Resource; clientId?: string };

export type AccessContext = {
  assignedClientIds: ReadonlySet<string>;
  clientRoles: ReadonlyMap<string, readonly ClientRole[]>;
};

export type AuthorizationResult = { allowed: true } | { allowed: false; reason: 'forbidden' };
