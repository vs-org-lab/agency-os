import { ACCESS_MATRIX } from './matrix';
import {
  ACTIONS,
  INTERNAL_ROLES,
  RESOURCES,
  ROLES,
  type AccessContext,
  type Action,
  type Actor,
  type AuthorizationResult,
  type Permission,
  type ResourceRef,
  type Role,
} from './types';

const ALLOWED: AuthorizationResult = { allowed: true };
const FORBIDDEN: AuthorizationResult = { allowed: false, reason: 'forbidden' };

function grants(permission: Permission, action: Action): boolean {
  return permission.action === action || (action === 'draft' && permission.action === 'write');
}

function permissionsFor(resource: ResourceRef['type'], role: Role): readonly Permission[] {
  return ACCESS_MATRIX[resource][role] ?? [];
}

function internalAllows(
  actor: Actor,
  action: Action,
  resource: ResourceRef,
  ctx: AccessContext,
): boolean {
  if (actor.mfaVerifiedAt === null) return false;

  return actor.roles.some((role) => {
    if (!(INTERNAL_ROLES as readonly string[]).includes(role)) return false;
    return permissionsFor(resource.type, role).some((permission) => {
      if (!grants(permission, action)) return false;
      if (permission.scope === 'all') return true;
      if (permission.scope === 'own') {
        return resource.clientId !== undefined && ctx.assignedClientIds.has(resource.clientId);
      }
      return false;
    });
  });
}

function clientAllows(action: Action, resource: ResourceRef, ctx: AccessContext): boolean {
  if (resource.clientId === undefined) return false;
  const roles = ctx.clientRoles.get(resource.clientId) ?? [];

  return roles.some((role) =>
    permissionsFor(resource.type, role).some(
      (permission) => permission.scope === 'own_room' && grants(permission, action),
    ),
  );
}

function agentAllows(action: Action, resource: ResourceRef): boolean {
  return permissionsFor(resource.type, 'agent').some((permission) => grants(permission, action));
}

export function authorize(
  actor: Actor,
  action: Action,
  resource: ResourceRef,
  ctx: AccessContext,
): AuthorizationResult {
  if (!(ACTIONS as readonly string[]).includes(action)) return FORBIDDEN;
  if (!(RESOURCES as readonly string[]).includes(resource.type)) return FORBIDDEN;
  if (actor.roles.some((role) => !(ROLES as readonly string[]).includes(role))) return FORBIDDEN;

  const humanAllowed =
    internalAllows(actor, action, resource, ctx) || clientAllows(action, resource, ctx);
  if (!humanAllowed) return FORBIDDEN;

  if (actor.roles.includes('agent') && !agentAllows(action, resource)) return FORBIDDEN;

  return ALLOWED;
}
