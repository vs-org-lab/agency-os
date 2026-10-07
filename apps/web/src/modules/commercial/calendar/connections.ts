import { and, asc, eq, sql } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { resolveActor, type Actor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { createFakeCalendarPort } from './fake';
import { createGoogleCalendarPort } from './google';
import { refreshAccessToken } from './google-oauth';
import { CalendarUnavailableError, type CalendarPort } from './port';

const { calendarConnections, commercialSettings, organizationMemberships } = schema;

export type CalendarProvider = 'google' | 'fake';

export type ConnectionDeps = { contexts: DbContexts; flush?: () => Promise<void> };

export type HostCalendarDeps = {
  contexts: Pick<DbContexts, 'withSystemContext'>;
  provider: CalendarProvider;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  flush?: () => Promise<void>;
};

export type ConnectionStatus =
  { status: 'none' } | { status: 'active' | 'revoked' | 'error'; email: string };

const ACCESS_TOKEN_MARGIN_MS = 60_000;
const accessTokenCache = new Map<string, { token: string; expiresAt: number }>();

async function founderActor(deps: ConnectionDeps, claims: VerifiedClaims): Promise<Actor | null> {
  return deps.contexts.withUserContext(claims, async (tx) => {
    const actor = await resolveActor(tx, claims);
    return actor && actor.mfaVerifiedAt && actor.roles.includes('founder') ? actor : null;
  });
}

async function auditAs(
  deps: ConnectionDeps,
  claims: VerifiedClaims,
  input: {
    organizationId: string;
    action: 'calendar.connected' | 'calendar.disconnected';
    connectionId: string;
  },
): Promise<void> {
  await deps.contexts.withUserContext(claims, (tx) =>
    recordAudit(tx, {
      organizationId: input.organizationId,
      action: input.action,
      resourceType: 'calendar_connection',
      resourceId: input.connectionId,
      metadata: { provider: 'google' },
    }),
  );
}

export async function saveGoogleConnection(
  claims: VerifiedClaims,
  input: { refreshToken: string; email: string },
  deps: ConnectionDeps,
): Promise<{ ok: boolean }> {
  const actor = await founderActor(deps, claims);
  if (!actor) return { ok: false };

  const connectionId = await deps.contexts.withSystemContext(async (tx) => {
    const [connection] = await tx
      .insert(calendarConnections)
      .values({
        organizationId: actor.organizationId,
        userId: actor.userId,
        provider: 'google',
        accountEmail: input.email,
        status: 'active',
        lastCheckedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [calendarConnections.userId, calendarConnections.provider],
        set: {
          organizationId: actor.organizationId,
          accountEmail: input.email,
          status: 'active',
          lastCheckedAt: new Date(),
        },
      })
      .returning({ id: calendarConnections.id });
    if (!connection) throw new Error('Calendar connection was not saved');

    await tx.execute(
      sql`select app.store_calendar_secret(${connection.id}::uuid, ${input.refreshToken})`,
    );
    await tx
      .insert(commercialSettings)
      .values({ organizationId: actor.organizationId, hostUserId: actor.userId })
      .onConflictDoUpdate({
        target: commercialSettings.organizationId,
        set: { hostUserId: sql`coalesce(${commercialSettings.hostUserId}, excluded.host_user_id)` },
      });
    return connection.id;
  });

  accessTokenCache.delete(connectionId);
  await auditAs(deps, claims, {
    organizationId: actor.organizationId,
    action: 'calendar.connected',
    connectionId,
  });
  return { ok: true };
}

export async function calendarConnectionStatus(
  claims: VerifiedClaims,
  deps: Pick<ConnectionDeps, 'contexts'>,
): Promise<ConnectionStatus> {
  const [row] = await deps.contexts.withUserContext(claims, (tx) =>
    tx
      .select({ status: calendarConnections.status, email: calendarConnections.accountEmail })
      .from(calendarConnections)
      .where(
        and(eq(calendarConnections.userId, claims.sub), eq(calendarConnections.provider, 'google')),
      ),
  );
  return row ? { status: row.status, email: row.email } : { status: 'none' };
}

export async function disconnectGoogle(
  claims: VerifiedClaims,
  deps: ConnectionDeps & { revoke: (token: string) => Promise<void> },
): Promise<{ ok: boolean }> {
  const actor = await founderActor(deps, claims);
  if (!actor) return { ok: false };

  const removed = await deps.contexts.withSystemContext(async (tx) => {
    const [connection] = await tx
      .select({ id: calendarConnections.id })
      .from(calendarConnections)
      .where(
        and(
          eq(calendarConnections.userId, actor.userId),
          eq(calendarConnections.provider, 'google'),
        ),
      );
    if (!connection) return null;
    const rows = await tx.execute<{ token: string | null }>(
      sql`select app.read_calendar_secret(${connection.id}::uuid) as token`,
    );
    await tx.execute(sql`select app.delete_calendar_secret(${connection.id}::uuid)`);
    await tx
      .update(calendarConnections)
      .set({ status: 'revoked' })
      .where(eq(calendarConnections.id, connection.id));
    return { connectionId: connection.id, token: rows[0]?.token ?? null };
  });
  if (!removed) return { ok: true };

  accessTokenCache.delete(removed.connectionId);
  if (removed.token) await deps.revoke(removed.token);
  await auditAs(deps, claims, {
    organizationId: actor.organizationId,
    action: 'calendar.disconnected',
    connectionId: removed.connectionId,
  });
  return { ok: true };
}

export async function markConnectionRevoked(
  input: { connectionId: string; organizationId: string },
  deps: Pick<HostCalendarDeps, 'contexts' | 'flush'>,
): Promise<void> {
  accessTokenCache.delete(input.connectionId);
  const changed = await deps.contexts.withSystemContext(async (tx) => {
    const updated = await tx
      .update(calendarConnections)
      .set({ status: 'revoked', lastCheckedAt: new Date() })
      .where(
        and(
          eq(calendarConnections.id, input.connectionId),
          eq(calendarConnections.status, 'active'),
        ),
      )
      .returning({ id: calendarConnections.id });
    if (updated.length === 0) return false;
    await emit(tx, {
      type: 'commercial.calendar.unavailable',
      organizationId: input.organizationId,
      payload: { connectionId: input.connectionId, reason: 'revoked' },
    });
    return true;
  });
  if (changed) await (deps.flush ?? requestFlush)();
}

async function hostUserIdFor(tx: DbTransaction, organizationId: string): Promise<string | null> {
  const [settings] = await tx
    .select({ hostUserId: commercialSettings.hostUserId })
    .from(commercialSettings)
    .where(eq(commercialSettings.organizationId, organizationId));
  if (settings?.hostUserId) return settings.hostUserId;

  const [founder] = await tx
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.role, 'founder'),
        eq(organizationMemberships.status, 'active'),
      ),
    )
    .orderBy(asc(organizationMemberships.createdAt))
    .limit(1);
  return founder?.userId ?? null;
}

function guardRevocation(port: CalendarPort, onRevoked: () => Promise<void>): CalendarPort {
  const guarded = <T>(operation: () => Promise<T>) =>
    operation().catch(async (error: unknown) => {
      if (error instanceof CalendarUnavailableError && error.reason === 'revoked')
        await onRevoked();
      throw error;
    });
  return {
    freeBusy: (range) => guarded(() => port.freeBusy(range)),
    createEvent: (input) => guarded(() => port.createEvent(input)),
    updateEvent: (eventId, input) => guarded(() => port.updateEvent(eventId, input)),
    deleteEvent: (eventId) => guarded(() => port.deleteEvent(eventId)),
  };
}

export async function getHostCalendar(
  organizationId: string,
  deps: HostCalendarDeps,
): Promise<{ port: CalendarPort; hostUserId: string } | null> {
  const host = await deps.contexts.withSystemContext(async (tx) => {
    const hostUserId = await hostUserIdFor(tx, organizationId);
    if (!hostUserId) return null;
    const [connection] = await tx
      .select({ id: calendarConnections.id, calendarId: calendarConnections.calendarId })
      .from(calendarConnections)
      .where(
        and(
          eq(calendarConnections.userId, hostUserId),
          eq(calendarConnections.provider, 'google'),
          eq(calendarConnections.status, 'active'),
        ),
      );
    return { hostUserId, connection: connection ?? null };
  });
  if (!host) return null;
  if (deps.provider === 'fake')
    return { port: createFakeCalendarPort(), hostUserId: host.hostUserId };
  if (!host.connection) return null;

  const connection = host.connection;
  const onRevoked = () =>
    markConnectionRevoked({ connectionId: connection.id, organizationId }, deps);

  const accessToken = async (): Promise<string> => {
    const cached = accessTokenCache.get(connection.id);
    if (cached && cached.expiresAt - ACCESS_TOKEN_MARGIN_MS > Date.now()) return cached.token;

    const rows = await deps.contexts.withSystemContext((tx) =>
      tx.execute<{ token: string | null }>(
        sql`select app.read_calendar_secret(${connection.id}::uuid) as token`,
      ),
    );
    const refreshToken = rows[0]?.token;
    if (!refreshToken) throw new CalendarUnavailableError('not_connected');

    const fresh = await refreshAccessToken({
      refreshToken,
      clientId: deps.clientId,
      clientSecret: deps.clientSecret,
      fetch: deps.fetch,
    });
    accessTokenCache.set(connection.id, {
      token: fresh.accessToken,
      expiresAt: fresh.expiresAt.getTime(),
    });
    return fresh.accessToken;
  };

  const port = createGoogleCalendarPort({
    calendarId: connection.calendarId,
    accessToken,
    fetch: deps.fetch,
  });
  return { port: guardRevocation(port, onRevoked), hostUserId: host.hostUserId };
}
