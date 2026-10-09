import type { ClientRole } from '@/modules/access';

const ROOM_ROLES: readonly ClientRole[] = ['decision_maker', 'operational'];

/** The client whose room the portal user sees, and whether they read it or also decide in it. */
export function portalRoomAccess(clientRoles: ReadonlyMap<string, readonly ClientRole[]>): {
  clientId: string | null;
  readsRoom: boolean;
  decides: boolean;
} {
  const [clientId, roles = []] = [...clientRoles.entries()][0] ?? [];
  return {
    clientId: clientId ?? null,
    readsRoom: roles.some((role) => ROOM_ROLES.includes(role)),
    decides: roles.includes('decision_maker'),
  };
}
