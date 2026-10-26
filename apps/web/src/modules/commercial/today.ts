import { TZDate } from '@date-fns/tz';
import { and, eq, gte, isNull, lt, lte } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';

const { applications, calls, clients, followUps } = schema;

export const QUEUE_B_REVIEW_MS = 24 * 60 * 60 * 1000;

export type TodayItem = {
  kind: 'follow_up' | 'queue_b' | 'call';
  id: string;
  dealId: string;
  clientName: string;
  dueAt: Date;
  overdue: boolean;
  sequenceDay: number | null;
};

function localDayBounds(now: Date, timeZone: string): { start: Date; end: Date; date: string } {
  const local = new TZDate(now.getTime(), timeZone);
  const start = new TZDate(local.getFullYear(), local.getMonth(), local.getDate(), timeZone);
  const end = new TZDate(local.getFullYear(), local.getMonth(), local.getDate() + 1, timeZone);
  const month = String(local.getMonth() + 1).padStart(2, '0');
  const day = String(local.getDate()).padStart(2, '0');
  return {
    start: new Date(start.getTime()),
    end: new Date(end.getTime()),
    date: `${local.getFullYear()}-${month}-${day}`,
  };
}

function startOfLocalDate(date: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(new TZDate(year ?? 1970, (month ?? 1) - 1, day ?? 1, timeZone).getTime());
}

export async function listTodayItems(
  tx: DbTransaction,
  input: { now: Date; timeZone: string; organizationId: string },
): Promise<TodayItem[]> {
  const today = localDayBounds(input.now, input.timeZone);

  const dueFollowUps = await tx
    .select({
      id: followUps.id,
      dealId: followUps.dealId,
      clientName: clients.name,
      dueOn: followUps.dueOn,
      sequenceDay: followUps.sequenceDay,
    })
    .from(followUps)
    .innerJoin(clients, eq(clients.id, followUps.clientId))
    .where(
      and(
        eq(followUps.organizationId, input.organizationId),
        eq(followUps.status, 'open'),
        lte(followUps.dueOn, today.date),
      ),
    );

  const pendingQueue = await tx
    .select({
      id: applications.id,
      dealId: applications.dealId,
      clientName: clients.name,
      createdAt: applications.createdAt,
    })
    .from(applications)
    .innerJoin(clients, eq(clients.id, applications.clientId))
    .where(
      and(
        eq(applications.organizationId, input.organizationId),
        eq(applications.path, 'b'),
        isNull(applications.reviewDecision),
      ),
    );

  const todaysCalls = await tx
    .select({
      id: calls.id,
      dealId: calls.dealId,
      clientName: clients.name,
      startsAt: calls.startsAt,
    })
    .from(calls)
    .innerJoin(clients, eq(clients.id, calls.clientId))
    .where(
      and(
        eq(calls.organizationId, input.organizationId),
        eq(calls.status, 'scheduled'),
        gte(calls.startsAt, today.start),
        lt(calls.startsAt, today.end),
      ),
    );

  const items: TodayItem[] = [
    ...dueFollowUps.map((row) => ({
      kind: 'follow_up' as const,
      id: row.id,
      dealId: row.dealId,
      clientName: row.clientName,
      dueAt: startOfLocalDate(row.dueOn, input.timeZone),
      overdue: row.dueOn < today.date,
      sequenceDay: row.sequenceDay,
    })),
    ...pendingQueue.map((row) => {
      const dueAt = new Date(row.createdAt.getTime() + QUEUE_B_REVIEW_MS);
      return {
        kind: 'queue_b' as const,
        id: row.id,
        dealId: row.dealId,
        clientName: row.clientName,
        dueAt,
        overdue: dueAt.getTime() < input.now.getTime(),
        sequenceDay: null,
      };
    }),
    ...todaysCalls.map((row) => ({
      kind: 'call' as const,
      id: row.id,
      dealId: row.dealId,
      clientName: row.clientName,
      dueAt: row.startsAt,
      overdue: false,
      sequenceDay: null,
    })),
  ];

  return items.sort((first, second) =>
    first.overdue === second.overdue
      ? first.dueAt.getTime() - second.dueAt.getTime()
      : first.overdue
        ? -1
        : 1,
  );
}
