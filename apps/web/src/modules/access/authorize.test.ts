import { describe, expect, it } from 'vitest';
import { authorize } from './authorize';
import type { AccessContext, Action, Actor, Resource } from './types';

const CLIENT_A = '00000000-0000-4000-8000-00000000000a';
const emptyContext: AccessContext = { assignedClientIds: new Set(), clientRoles: new Map() };
const founder: Actor = {
  userId: 'user',
  organizationId: 'organization',
  roles: ['founder'],
  mfaVerifiedAt: new Date(),
};

describe('authorize', () => {
  it('unknown role is denied', () => {
    const actor = { ...founder, roles: ['owner'] } as unknown as Actor;
    expect(authorize(actor, 'read', { type: 'rooms' }, emptyContext)).toEqual({
      allowed: false,
      reason: 'forbidden',
    });
  });

  it('unknown action is denied', () => {
    expect(authorize(founder, 'delete' as Action, { type: 'rooms' }, emptyContext).allowed).toBe(
      false,
    );
  });

  it('unknown resource is denied', () => {
    expect(authorize(founder, 'read', { type: 'payroll' as Resource }, emptyContext).allowed).toBe(
      false,
    );
  });

  it('own scope without clientId is denied', () => {
    const manager: Actor = { ...founder, roles: ['project_manager'] };
    const ctx: AccessContext = { assignedClientIds: new Set([CLIENT_A]), clientRoles: new Map() };
    expect(authorize(manager, 'read', { type: 'rooms' }, ctx).allowed).toBe(false);
  });

  it('own_room scope without clientId is denied', () => {
    const client: Actor = { ...founder, roles: [], mfaVerifiedAt: null };
    const ctx: AccessContext = {
      assignedClientIds: new Set(),
      clientRoles: new Map([[CLIENT_A, ['decision_maker']]]),
    };
    expect(authorize(client, 'read', { type: 'rooms' }, ctx).allowed).toBe(false);
  });

  it('founder is allowed everything except actions not in matrix', () => {
    expect(authorize(founder, 'pay', { type: 'invoices' }, emptyContext).allowed).toBe(false);
    expect(authorize(founder, 'write', { type: 'audit_log' }, emptyContext).allowed).toBe(false);
    expect(authorize(founder, 'approve', { type: 'commercial_values' }, emptyContext).allowed).toBe(
      true,
    );
    expect(authorize(founder, 'invite', { type: 'users' }, emptyContext).allowed).toBe(true);
  });

  it('internal roles without verified mfa are denied', () => {
    const unverified: Actor = { ...founder, mfaVerifiedAt: null };
    expect(authorize(unverified, 'read', { type: 'rooms' }, emptyContext).allowed).toBe(false);
  });

  it('dual-role user without mfa keeps client permissions only', () => {
    const dual: Actor = { ...founder, roles: ['project_manager'], mfaVerifiedAt: null };
    const ctx: AccessContext = {
      assignedClientIds: new Set([CLIENT_A]),
      clientRoles: new Map([[CLIENT_A, ['operational']]]),
    };
    expect(authorize(dual, 'write', { type: 'library', clientId: CLIENT_A }, ctx).allowed).toBe(
      true,
    );
    expect(
      authorize(dual, 'write', { type: 'commercial_values', clientId: CLIENT_A }, ctx).allowed,
    ).toBe(false);
  });

  it('agent alone has no permissions', () => {
    const agentOnly: Actor = { ...founder, roles: ['agent'] };
    expect(authorize(agentOnly, 'read', { type: 'pipeline' }, emptyContext).allowed).toBe(false);
  });
});
