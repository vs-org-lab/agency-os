import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type ClientRole } from '@agency-os/db';
import { withActor, type Actor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import { inviteClientUser, type InvitationDeps } from '@/modules/identity';
import type { VerifiedClaims } from '@/platform/db';
import { canLoseDecisionMaker } from './domain/guards';

const { clientMemberships, profiles } = schema;

export type ColleagueView = {
  membershipId: string;
  name: string;
  email: string;
  role: ClientRole;
  status: 'invited' | 'active' | 'revoked';
  isSelf: boolean;
};

export type ColleagueResult =
  { ok: true } | { ok: false; rule: 'not_found' | 'invalid_input' | 'last_decision_maker' };

const CLIENT_ROLES = ['decision_maker', 'operational', 'client_finance'] as const;
const uuid = z.uuid();

/** P-11: only an active decision maker of the client manages its colleagues. */
async function decisionMaker(
  deps: Pick<InvitationDeps, 'contexts'>,
  claims: VerifiedClaims,
  clientId: string,
): Promise<Actor | null> {
  if (!uuid.safeParse(clientId).success) return null;
  return withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const rows = await tx.execute<{ allowed: boolean }>(
        sql`select app.is_client_member(${clientId}::uuid, array['decision_maker']::app.client_role[]) as allowed`,
      );
      return rows[0]?.allowed === true ? actor : null;
    },
    null,
  );
}

export async function listColleagues(
  claims: VerifiedClaims,
  clientId: string,
  deps: Pick<InvitationDeps, 'contexts'>,
): Promise<ColleagueView[] | null> {
  const actor = await decisionMaker(deps, claims, clientId);
  if (!actor) return null;
  const rows = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        membershipId: clientMemberships.id,
        userId: clientMemberships.userId,
        name: profiles.fullName,
        email: sql<
          string | null
        >`(select email from auth.users u where u.id = ${clientMemberships.userId})`,
        role: clientMemberships.role,
        status: clientMemberships.status,
      })
      .from(clientMemberships)
      .innerJoin(profiles, eq(profiles.id, clientMemberships.userId))
      .where(and(eq(clientMemberships.clientId, clientId), isNull(clientMemberships.archivedAt)))
      .orderBy(asc(profiles.fullName)),
  );
  return rows.map((row) => ({
    membershipId: row.membershipId,
    name: row.name,
    email: row.email ?? '',
    role: row.role,
    status: row.status,
    isSelf: row.userId === actor.userId,
  }));
}

export async function inviteColleague(
  claims: VerifiedClaims,
  input: { clientId: string; email: string; fullName: string; role: ClientRole },
  deps: InvitationDeps,
): Promise<ColleagueResult> {
  const actor = await decisionMaker(deps, claims, input.clientId);
  if (!actor) return { ok: false, rule: 'not_found' };
  const result = await inviteClientUser({ claims, actor }, input, deps);
  if ('membershipId' in result) return { ok: true };
  return { ok: false, rule: result.error === 'forbidden' ? 'not_found' : 'invalid_input' };
}

type Target = { actor: Actor; clientId: string; userId: string; role: ClientRole };

/** The colleague's membership when the caller manages that client and it is not themselves. */
async function colleagueTarget(
  claims: VerifiedClaims,
  membershipId: string,
  deps: Pick<InvitationDeps, 'contexts'>,
): Promise<Target | ColleagueResult> {
  if (!uuid.safeParse(membershipId).success) return { ok: false, rule: 'not_found' };
  const [membership] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        clientId: clientMemberships.clientId,
        userId: clientMemberships.userId,
        role: clientMemberships.role,
      })
      .from(clientMemberships)
      .where(and(eq(clientMemberships.id, membershipId), isNull(clientMemberships.archivedAt))),
  );
  if (!membership) return { ok: false, rule: 'not_found' };
  const actor = await decisionMaker(deps, claims, membership.clientId);
  if (!actor) return { ok: false, rule: 'not_found' };
  if (membership.userId === actor.userId) return { ok: false, rule: 'invalid_input' };
  return { actor, ...membership };
}

async function keepsDecisionMaker(
  deps: Pick<InvitationDeps, 'contexts'>,
  target: Target,
): Promise<boolean> {
  if (target.role !== 'decision_maker') return true;
  const rows = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ userId: clientMemberships.userId })
      .from(clientMemberships)
      .where(
        and(
          eq(clientMemberships.clientId, target.clientId),
          eq(clientMemberships.role, 'decision_maker'),
          eq(clientMemberships.status, 'active'),
          isNull(clientMemberships.archivedAt),
        ),
      ),
  );
  return canLoseDecisionMaker(
    rows.map((row) => row.userId),
    target.userId,
  );
}

async function auditColleague(
  deps: Pick<InvitationDeps, 'contexts'>,
  claims: VerifiedClaims,
  target: Target,
  membershipId: string,
  action: 'colleague.role_changed' | 'colleague.access_revoked',
  metadata: Record<string, unknown>,
): Promise<void> {
  await deps.contexts.withUserContext(claims, (tx) =>
    recordAudit(tx, {
      organizationId: target.actor.organizationId,
      action,
      resourceType: 'client_membership',
      resourceId: membershipId,
      clientId: target.clientId,
      metadata,
    }),
  );
}

export async function changeColleagueRole(
  claims: VerifiedClaims,
  input: { membershipId: string; role: ClientRole },
  deps: Pick<InvitationDeps, 'contexts'>,
): Promise<ColleagueResult> {
  if (!(CLIENT_ROLES as readonly string[]).includes(input.role)) {
    return { ok: false, rule: 'invalid_input' };
  }
  const target = await colleagueTarget(claims, input.membershipId, deps);
  if ('ok' in target) return target;
  if (target.role === input.role) return { ok: true };
  if (!(await keepsDecisionMaker(deps, target))) return { ok: false, rule: 'last_decision_maker' };
  await deps.contexts.withSystemContext((tx) =>
    tx
      .update(clientMemberships)
      .set({ role: input.role })
      .where(eq(clientMemberships.id, input.membershipId)),
  );
  await auditColleague(deps, claims, target, input.membershipId, 'colleague.role_changed', {
    from: target.role,
    to: input.role,
  });
  return { ok: true };
}

export async function revokeColleague(
  claims: VerifiedClaims,
  input: { membershipId: string },
  deps: Pick<InvitationDeps, 'contexts'>,
): Promise<ColleagueResult> {
  const target = await colleagueTarget(claims, input.membershipId, deps);
  if ('ok' in target) return target;
  if (!(await keepsDecisionMaker(deps, target))) return { ok: false, rule: 'last_decision_maker' };
  await deps.contexts.withSystemContext((tx) =>
    tx
      .update(clientMemberships)
      .set({ status: 'revoked' })
      .where(eq(clientMemberships.id, input.membershipId)),
  );
  await auditColleague(deps, claims, target, input.membershipId, 'colleague.access_revoked', {});
  return { ok: true };
}
