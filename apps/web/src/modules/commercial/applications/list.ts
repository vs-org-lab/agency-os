import { and, desc, eq, ilike, isNull, or, type SQL } from 'drizzle-orm';
import { schema, type ApplicationPath, type DbTransaction } from '@agency-os/db';

const { applications, clients, contacts } = schema;

export type ApplicationRow = {
  id: string;
  dealId: string;
  createdAt: Date;
  companyName: string;
  contactName: string;
  score: number;
  path: ApplicationPath;
  reviewDecision: ApplicationPath | null;
  utmSource: string | null;
  utmCampaign: string | null;
  landingPage: string | null;
  anonymized: boolean;
};

export async function listApplications(
  tx: DbTransaction,
  input: { tab: 'all' | 'queue_b'; search?: string },
): Promise<ApplicationRow[]> {
  const conditions: SQL[] = [];
  if (input.tab === 'queue_b') {
    conditions.push(eq(applications.path, 'b'), isNull(applications.reviewDecision));
  }
  const search = input.search?.trim();
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    const match = or(ilike(clients.name, pattern), ilike(contacts.fullName, pattern));
    if (match) conditions.push(match);
  }

  const rows = await tx
    .select({
      id: applications.id,
      dealId: applications.dealId,
      createdAt: applications.createdAt,
      companyName: clients.name,
      contactName: contacts.fullName,
      score: applications.score,
      path: applications.path,
      reviewDecision: applications.reviewDecision,
      source: applications.source,
      anonymizedAt: applications.anonymizedAt,
    })
    .from(applications)
    .innerJoin(clients, eq(clients.id, applications.clientId))
    .innerJoin(contacts, eq(contacts.id, applications.contactId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(applications.createdAt))
    .limit(200);

  return rows.map((row) => {
    const source = (row.source ?? {}) as {
      utm?: { source?: string; campaign?: string };
      landingPage?: string | null;
    };
    return {
      id: row.id,
      dealId: row.dealId,
      createdAt: row.createdAt,
      companyName: row.companyName,
      contactName: row.contactName,
      score: row.score,
      path: row.path,
      reviewDecision: row.reviewDecision,
      utmSource: source.utm?.source ?? null,
      utmCampaign: source.utm?.campaign ?? null,
      landingPage: source.landingPage ?? null,
      anonymized: row.anonymizedAt !== null,
    };
  });
}
