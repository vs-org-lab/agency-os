import type { Permission, Resource, Role } from './types';

const all = (...actions: Permission['action'][]): Permission[] =>
  actions.map((action) => ({ action, scope: 'all' }));
const own = (...actions: Permission['action'][]): Permission[] =>
  actions.map((action) => ({ action, scope: 'own' }));
const ownRoom = (...actions: Permission['action'][]): Permission[] =>
  actions.map((action) => ({ action, scope: 'own_room' }));

/**
 * Access matrix from docs/product/08 Segurança.md ("Matriz de acesso").
 * A role absent from a resource has no access. `write` implies `draft`.
 * MFA, written reasons and temporary vault grants are enforced by the vault module.
 */
export const ACCESS_MATRIX: Readonly<
  Record<Resource, Partial<Record<Role, readonly Permission[]>>>
> = {
  pipeline: {
    founder: all('read', 'write'),
    project_manager: own('read', 'write'),
    finance: all('read'),
    agent: all('read', 'draft'),
  },
  rooms: {
    founder: all('read', 'write'),
    project_manager: own('read', 'write'),
    freelancer: own('read', 'write'),
    finance: all('read'),
    agent: all('read', 'draft'),
    decision_maker: ownRoom('read', 'approve'),
    operational: ownRoom('read', 'write'),
  },
  commercial_values: {
    founder: all('read', 'write', 'approve'),
    project_manager: own('read', 'write'),
    finance: all('read'),
    agent: all('read'),
    decision_maker: ownRoom('read', 'approve'),
    client_finance: ownRoom('read'),
  },
  invoices: {
    founder: all('read', 'write'),
    project_manager: all('read'),
    finance: all('read', 'write'),
    agent: all('read', 'draft'),
    decision_maker: ownRoom('read', 'pay'),
    client_finance: ownRoom('read', 'pay'),
  },
  library: {
    founder: all('read', 'write'),
    project_manager: own('read', 'write'),
    freelancer: own('read', 'write'),
    finance: all('read'),
    agent: all('read'),
    decision_maker: ownRoom('read'),
    operational: ownRoom('read', 'write'),
  },
  brand_hub: {
    founder: all('read', 'write', 'publish'),
    project_manager: own('read', 'write', 'publish'),
    freelancer: own('read', 'write'),
    agent: all('draft'),
    decision_maker: ownRoom('read', 'approve'),
    operational: ownRoom('read'),
  },
  vault: {
    founder: all('read', 'write'),
    project_manager: own('read'),
    freelancer: own('read'),
    decision_maker: ownRoom('write'),
    operational: ownRoom('write'),
  },
  users: {
    founder: all('read', 'write', 'invite'),
    decision_maker: ownRoom('invite'),
  },
  audit_log: {
    founder: all('read'),
  },
};
