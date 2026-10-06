import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import { authorize, loadAccessContext, type Actor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import { emit } from '@/modules/events';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { normalizeEmail, type UserKind } from './auth-port';

const { clientMemberships, organizationMemberships, organizations, profiles } = schema;

export type Session = { claims: VerifiedClaims; actor: Actor };

export type AdminPort = {
  inviteUserByEmail(
    email: string,
    options: { redirectTo: string; data?: Record<string, unknown> },
  ): Promise<{ userId: string }>;
};

export type InvitationDeps = {
  contexts: DbContexts;
  admin: AdminPort;
  invitationRedirectUrl: string;
};

export type InvitationResult = { membershipId: string } | { error: 'forbidden' | 'invalid_input' };

const fullName = z.string().trim().min(1).max(200);
const email = z.email().max(320);

const teamInvitationSchema = z.object({
  email,
  fullName,
  role: z.enum(['project_manager', 'freelancer', 'finance']),
});

const clientInvitationSchema = z.object({
  email,
  fullName,
  clientId: z.uuid(),
  role: z.enum(['decision_maker', 'operational', 'client_finance']),
});

export type TeamInvitationInput = z.input<typeof teamInvitationSchema>;
export type ClientInvitationInput = z.input<typeof clientInvitationSchema>;

async function ensureProfile(
  tx: DbTransaction,
  userId: string,
  name: string,
  kind: UserKind,
): Promise<void> {
  await tx.insert(profiles).values({ id: userId, fullName: name, kind }).onConflictDoNothing();
}

async function canInvite(
  session: Session,
  deps: InvitationDeps,
  clientId?: string,
): Promise<boolean> {
  return deps.contexts.withUserContext(session.claims, async (tx) => {
    const ctx = await loadAccessContext(tx, session.actor);
    return authorize(session.actor, 'invite', { type: 'users', clientId }, ctx).allowed;
  });
}

export async function inviteTeamMember(
  session: Session,
  input: TeamInvitationInput,
  deps: InvitationDeps,
): Promise<InvitationResult> {
  const parsed = teamInvitationSchema.safeParse({ ...input, email: normalizeEmail(input.email) });
  if (!parsed.success) return { error: 'invalid_input' };
  if (!(await canInvite(session, deps))) return { error: 'forbidden' };

  const { userId } = await deps.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: deps.invitationRedirectUrl,
    data: { full_name: parsed.data.fullName },
  });
  await deps.contexts.withSystemContext((tx) =>
    ensureProfile(tx, userId, parsed.data.fullName, 'internal'),
  );

  const organizationId = session.actor.organizationId;
  return deps.contexts.withUserContext(session.claims, async (tx) => {
    const [created] = await tx
      .insert(organizationMemberships)
      .values({ organizationId, userId, role: parsed.data.role, status: 'invited' })
      .onConflictDoNothing({
        target: [organizationMemberships.organizationId, organizationMemberships.userId],
      })
      .returning({ id: organizationMemberships.id });

    if (!created) {
      const [existing] = await tx
        .select({ id: organizationMemberships.id })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, organizationId),
            eq(organizationMemberships.userId, userId),
          ),
        );
      if (!existing) return { error: 'forbidden' as const };
      return { membershipId: existing.id };
    }

    await emit(tx, {
      type: 'identity.user.invited',
      organizationId,
      payload: { membershipId: created.id, userId, kind: 'internal', role: parsed.data.role },
    });
    await recordAudit(tx, {
      organizationId,
      action: 'invitation.created',
      resourceType: 'organization_membership',
      resourceId: created.id,
      metadata: { role: parsed.data.role },
    });
    return { membershipId: created.id };
  });
}

export async function inviteClientUser(
  session: Session,
  input: ClientInvitationInput,
  deps: InvitationDeps,
): Promise<InvitationResult> {
  const parsed = clientInvitationSchema.safeParse({ ...input, email: normalizeEmail(input.email) });
  if (!parsed.success) return { error: 'invalid_input' };
  if (!(await canInvite(session, deps, parsed.data.clientId))) return { error: 'forbidden' };

  const { userId } = await deps.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: deps.invitationRedirectUrl,
    data: { full_name: parsed.data.fullName },
  });
  await deps.contexts.withSystemContext((tx) =>
    ensureProfile(tx, userId, parsed.data.fullName, 'client'),
  );

  const organizationId = session.actor.organizationId;
  const { clientId, role } = parsed.data;
  return deps.contexts.withUserContext(session.claims, async (tx) => {
    const [created] = await tx
      .insert(clientMemberships)
      .values({ organizationId, clientId, userId, role, status: 'invited' })
      .onConflictDoNothing({ target: [clientMemberships.clientId, clientMemberships.userId] })
      .returning({ id: clientMemberships.id });

    if (!created) {
      const [existing] = await tx
        .select({ id: clientMemberships.id })
        .from(clientMemberships)
        .where(and(eq(clientMemberships.clientId, clientId), eq(clientMemberships.userId, userId)));
      if (!existing) return { error: 'forbidden' as const };
      return { membershipId: existing.id };
    }

    await emit(tx, {
      type: 'identity.user.invited',
      organizationId,
      clientId,
      payload: { membershipId: created.id, userId, kind: 'client', role },
    });
    await recordAudit(tx, {
      organizationId,
      action: 'invitation.created',
      resourceType: 'client_membership',
      resourceId: created.id,
      clientId,
      metadata: { role },
    });
    return { membershipId: created.id };
  });
}

export async function acceptInvitation(
  claims: VerifiedClaims,
  deps: Pick<InvitationDeps, 'contexts'>,
): Promise<{ activated: number }> {
  const activatedOrganizations = await deps.contexts.withSystemContext(async (tx) => {
    const internal = await tx
      .update(organizationMemberships)
      .set({ status: 'active' })
      .where(
        and(
          eq(organizationMemberships.userId, claims.sub),
          eq(organizationMemberships.status, 'invited'),
          isNull(organizationMemberships.archivedAt),
        ),
      )
      .returning({ organizationId: organizationMemberships.organizationId });
    const client = await tx
      .update(clientMemberships)
      .set({ status: 'active' })
      .where(
        and(
          eq(clientMemberships.userId, claims.sub),
          eq(clientMemberships.status, 'invited'),
          isNull(clientMemberships.archivedAt),
        ),
      )
      .returning({ organizationId: clientMemberships.organizationId });
    return [...internal, ...client].map((row) => row.organizationId);
  });

  if (activatedOrganizations.length > 0) {
    await deps.contexts.withUserContext(claims, async (tx) => {
      for (const organizationId of new Set(activatedOrganizations)) {
        await recordAudit(tx, {
          organizationId,
          action: 'invitation.accepted',
          resourceType: 'membership',
          resourceId: claims.sub,
        });
      }
    });
  }

  return { activated: activatedOrganizations.length };
}

export function organizationSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type BootstrapResult = { organizationId: string; userId: string; created: boolean };

export async function bootstrapFounder(
  input: { email: string; fullName: string; organizationName: string },
  deps: InvitationDeps,
): Promise<BootstrapResult> {
  const founderEmail = normalizeEmail(input.email);
  const name = fullName.parse(input.fullName);
  const organizationName = input.organizationName.trim();
  const slug = organizationSlug(organizationName);
  if (!slug || !email.safeParse(founderEmail).success) {
    throw new Error('Invalid founder bootstrap input');
  }

  const { organizationId, created } = await deps.contexts.withSystemContext(async (tx) => {
    const [inserted] = await tx
      .insert(organizations)
      .values({ name: organizationName, slug })
      .onConflictDoNothing({ target: organizations.slug })
      .returning({ id: organizations.id });
    if (inserted) return { organizationId: inserted.id, created: true };

    const [existing] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug));
    if (!existing) throw new Error('Organization lookup failed');
    return { organizationId: existing.id, created: false };
  });

  const { userId } = await deps.admin.inviteUserByEmail(founderEmail, {
    redirectTo: deps.invitationRedirectUrl,
    data: { full_name: name },
  });

  await deps.contexts.withSystemContext(async (tx) => {
    await ensureProfile(tx, userId, name, 'internal');
    await tx
      .insert(organizationMemberships)
      .values({ organizationId, userId, role: 'founder', status: 'invited' })
      .onConflictDoNothing({
        target: [organizationMemberships.organizationId, organizationMemberships.userId],
      });
  });

  return { organizationId, userId, created };
}

export async function lookupUserIdByEmail(
  contexts: Pick<DbContexts, 'withSystemContext'>,
  address: string,
): Promise<string | null> {
  const rows = await contexts.withSystemContext((tx) =>
    tx.execute<{ id: string }>(
      sql`select id from auth.users where lower(email) = ${normalizeEmail(address)} limit 1`,
    ),
  );
  return rows[0]?.id ?? null;
}
