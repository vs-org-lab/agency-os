import { describe, expect, it } from 'vitest';
import type { AccessContext, Actor } from '@/modules/access';
import { resolveHome, roomAccess } from './routing';

const CLIENT_A = '00000000-0000-4000-8000-00000000000a';
const CLIENT_B = '00000000-0000-4000-8000-00000000000b';

const internal: Actor = {
  userId: 'u',
  organizationId: 'o',
  roles: ['project_manager'],
  mfaVerifiedAt: new Date(),
};
const client: Actor = { userId: 'u', organizationId: 'o', roles: [], mfaVerifiedAt: null };

describe('resolveHome', () => {
  it('internal actor goes to studio, client actor to portal, anonymous to sign-in', () => {
    expect(resolveHome(internal)).toBe('/');
    expect(resolveHome(client)).toBe('/portal');
    expect(resolveHome(null)).toBe('/sign-in');
  });

  it('internal actor without verified mfa goes to verification', () => {
    expect(resolveHome({ ...internal, mfaVerifiedAt: null })).toBe('/mfa/verify');
  });
});

describe('roomAccess', () => {
  const ctx: AccessContext = { assignedClientIds: new Set([CLIENT_A]), clientRoles: new Map() };

  it('not found and forbidden render the same page', () => {
    expect(roomAccess(internal, CLIENT_B, ctx, { exists: true })).toBe('not_found');
    expect(roomAccess(internal, CLIENT_A, ctx, { exists: false })).toBe('not_found');
    expect(roomAccess(internal, CLIENT_A, ctx, { exists: true })).toBe('allowed');
  });
});
