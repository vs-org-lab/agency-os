import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import { authorize, loadAccessContext, type Actor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import { organizationSender, renderEmail, type EmailPort } from '@/modules/email';
import { emit } from '@/modules/events';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { normalizeEmail, type UserKind } from './auth-port';

const { clientMemberships, clients, organizationMemberships, organizations, profiles } = schema;

export type Session = { claims: VerifiedClaims; actor: Actor };

export type AdminPort = {
  inviteUserByEmail(
    email: string,
    options: { redirectTo: string; data?: Record<string, unknown> },
  ): Promise<{ userId: string }>;
};

/** Creates the account when needed and returns a single-use link for the OS to send. */
export type InvitationLinkPort = {
  createInvitationLink(
    email: string,
    options: { data?: Record<string, unknown> },
  ): Promise<{ userId: string; link: string }>;
};

export type InvitationDeps = {
  contexts: DbContexts;
  links: InvitationLinkPort;
  email: EmailPort;
};

export type BootstrapDeps = {
  contexts: DbContexts;
  admin: AdminPort;
  invitationRedirectUrl: string;
};

type StoredInvitation = { membershipId: string; created: boolean } | { error: 'forbidden' };

type ExistingAccount = {
  profileKind: UserKind | null;
  membership: { id: string; status: 'invited' | 'active' | 'revoked' } | null;
};

/**
 * The account already registered for this email, its profile kind and its membership in the
 * organisation (team invitations) or in the client (client invitations), so a repeat invitation
 * resends, refuses or reopens instead of reporting success while changing nothing.
 */
async function existingAccount(
  deps: Pick<InvitationDeps, 'contexts'>,
  address: string,
  scope: { organizationId: string } | { clientId: string },
): Promise<ExistingAccount | null> {
  const userId = await lookupUserIdByEmail(deps.contexts, address);
  if (!userId) return null;
  return deps.contexts.withSystemContext(async (tx) => {
    const [profile] = await tx
      .select({ kind: profiles.kind })
      .from(profiles)
      .where(eq(profiles.id, userId));
    const [membership] =
      'organizationId' in scope
        ? await tx
            .select({ id: organizationMemberships.id, status: organizationMemberships.status })
            .from(organizationMemberships)
            .where(
              and(
                eq(organizationMemberships.organizationId, scope.organizationId),
                eq(organizationMemberships.userId, userId),
                isNull(organizationMemberships.archivedAt),
              ),
            )
        : await tx
            .select({ id: clientMemberships.id, status: clientMemberships.status })
            .from(clientMemberships)
            .where(
              and(
                eq(clientMemberships.clientId, scope.clientId),
                eq(clientMemberships.userId, userId),
                isNull(clientMemberships.archivedAt),
              ),
            );
    return { profileKind: profile?.kind ?? null, membership: membership ?? null };
  });
}

type TeamRole = 'project_manager' | 'freelancer' | 'finance';
type ClientRole = 'decision_maker' | 'operational' | 'client_finance';

type InvitationEmail =
  | { kind: 'internal'; to: string; fullName: string; role: TeamRole; link: string }
  | {
      kind: 'client';
      to: string;
      fullName: string;
      role: ClientRole;
      clientId: string;
      link: string;
    };

/** Sends the invitation with the OS templates; the link never leaves this call. */
async function sendInvitationEmail(
  organizationId: string,
  invitation: InvitationEmail,
  deps: Pick<InvitationDeps, 'contexts' | 'email'>,
): Promise<void> {
  const { sender, clientName } = await deps.contexts.withSystemContext(async (tx) => {
    const [client] =
      invitation.kind === 'client'
        ? await tx
            .select({ name: clients.name })
            .from(clients)
            .where(eq(clients.id, invitation.clientId))
        : [];
    return { sender: await organizationSender(tx, organizationId), clientName: client?.name ?? '' };
  });
  const rendered =
    invitation.kind === 'internal'
      ? renderEmail('team.invitation', sender.defaultLocale, {
          fullName: invitation.fullName,
          agencyName: sender.agencyName,
          role: invitation.role,
          inviteUrl: invitation.link,
        })
      : renderEmail('client.invitation', sender.defaultLocale, {
          fullName: invitation.fullName,
          agencyName: sender.agencyName,
          clientName,
          role: invitation.role,
          inviteUrl: invitation.link,
        });
  await deps.email.send({
    to: invitation.to,
    template: invitation.kind === 'internal' ? 'team.invitation' : 'client.invitation',
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    fromName: sender.fromName,
    organizationId,
  });
}

export type InvitationResult =
  | { membershipId: string }
  | {
      error: 'forbidden' | 'invalid_input' | 'client_account' | 'already_member' | 'revoked_member';
    };

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
  const organizationId = session.actor.organizationId;

  const existing = await existingAccount(deps, parsed.data.email, { organizationId });
  if (existing?.profileKind === 'client') return { error: 'client_account' };
  if (existing?.membership?.status === 'active') return { error: 'already_member' };
  if (existing?.membership?.status === 'revoked') return { error: 'revoked_member' };

  const { userId, link } = await deps.links.createInvitationLink(parsed.data.email, {
    data: { full_name: parsed.data.fullName },
  });
  await deps.contexts.withSystemContext((tx) =>
    ensureProfile(tx, userId, parsed.data.fullName, 'internal'),
  );

  const result = await deps.contexts.withUserContext(
    session.claims,
    async (tx): Promise<StoredInvitation> => {
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
        return { membershipId: existing.id, created: false };
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
      return { membershipId: created.id, created: true };
    },
  );

  if ('error' in result) return result;
  await sendInvitationEmail(
    organizationId,
    {
      kind: 'internal',
      to: parsed.data.email,
      fullName: parsed.data.fullName,
      role: parsed.data.role,
      link,
    },
    deps,
  );
  return { membershipId: result.membershipId };
}

export async function inviteClientUser(
  session: Session,
  input: ClientInvitationInput,
  deps: InvitationDeps,
): Promise<InvitationResult> {
  const parsed = clientInvitationSchema.safeParse({ ...input, email: normalizeEmail(input.email) });
  if (!parsed.success) return { error: 'invalid_input' };
  if (!(await canInvite(session, deps, parsed.data.clientId))) return { error: 'forbidden' };
  const organizationId = session.actor.organizationId;
  const { clientId, role } = parsed.data;

  const existing = await existingAccount(deps, parsed.data.email, { clientId });
  if (existing?.membership?.status === 'active') return { error: 'already_member' };

  const { userId, link } = await deps.links.createInvitationLink(parsed.data.email, {
    data: { full_name: parsed.data.fullName },
  });
  await deps.contexts.withSystemContext(async (tx) => {
    await ensureProfile(tx, userId, parsed.data.fullName, 'client');
    if (existing?.membership?.status === 'revoked') {
      await tx
        .update(clientMemberships)
        .set({ status: 'invited', role })
        .where(eq(clientMemberships.id, existing.membership.id));
    }
  });

  const result = await deps.contexts.withUserContext(
    session.claims,
    async (tx): Promise<StoredInvitation> => {
      const [created] = await tx
        .insert(clientMemberships)
        .values({ organizationId, clientId, userId, role, status: 'invited' })
        .onConflictDoNothing({ target: [clientMemberships.clientId, clientMemberships.userId] })
        .returning({ id: clientMemberships.id });

      if (!created) {
        const [existing] = await tx
          .select({ id: clientMemberships.id })
          .from(clientMemberships)
          .where(
            and(eq(clientMemberships.clientId, clientId), eq(clientMemberships.userId, userId)),
          );
        if (!existing) return { error: 'forbidden' as const };
        return { membershipId: existing.id, created: false };
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
      return { membershipId: created.id, created: true };
    },
  );

  if ('error' in result) return result;
  await sendInvitationEmail(
    organizationId,
    { kind: 'client', to: parsed.data.email, fullName: parsed.data.fullName, role, clientId, link },
    deps,
  );
  return { membershipId: result.membershipId };
}

/**
 * Sends a fresh link to an invitation nobody has accepted yet, under the same rules as inviting.
 * Older links stay single use and expire on their own.
 */
export async function resendInvitation(
  session: Session,
  input: { membershipId: string; kind: 'internal' | 'client' },
  deps: InvitationDeps,
): Promise<{ ok: true } | { ok: false; rule: 'not_found' | 'invalid_state' }> {
  if (!z.uuid().safeParse(input.membershipId).success) return { ok: false, rule: 'not_found' };
  const organizationId = session.actor.organizationId;
  const pending = await deps.contexts.withSystemContext(async (tx) => {
    const table = input.kind === 'internal' ? organizationMemberships : clientMemberships;
    const [row] = await tx
      .select({
        userId: table.userId,
        role: table.role,
        status: table.status,
        clientId: input.kind === 'client' ? clientMemberships.clientId : sql<null>`null`,
        email: sql<string | null>`(select email from auth.users u where u.id = ${table.userId})`,
        fullName: profiles.fullName,
      })
      .from(table)
      .innerJoin(profiles, eq(profiles.id, table.userId))
      .where(
        and(
          eq(table.id, input.membershipId),
          eq(table.organizationId, organizationId),
          isNull(table.archivedAt),
        ),
      );
    return row ?? null;
  });
  if (!pending || !pending.email) return { ok: false, rule: 'not_found' };
  if (!(await canInvite(session, deps, pending.clientId ?? undefined))) {
    return { ok: false, rule: 'not_found' };
  }
  if (pending.status !== 'invited') return { ok: false, rule: 'invalid_state' };

  const { link } = await deps.links.createInvitationLink(pending.email, {
    data: { full_name: pending.fullName },
  });
  await sendInvitationEmail(
    organizationId,
    input.kind === 'internal'
      ? {
          kind: 'internal',
          to: pending.email,
          fullName: pending.fullName,
          role: pending.role as TeamRole,
          link,
        }
      : {
          kind: 'client',
          to: pending.email,
          fullName: pending.fullName,
          role: pending.role as ClientRole,
          clientId: pending.clientId ?? '',
          link,
        },
    deps,
  );
  await deps.contexts.withUserContext(session.claims, (tx) =>
    recordAudit(tx, {
      organizationId,
      action: 'invitation.resent',
      resourceType: input.kind === 'internal' ? 'organization_membership' : 'client_membership',
      resourceId: input.membershipId,
      clientId: pending.clientId ?? undefined,
    }),
  );
  return { ok: true };
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
  deps: BootstrapDeps,
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
