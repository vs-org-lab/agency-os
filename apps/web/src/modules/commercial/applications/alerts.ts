import { eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { alertFounders, type NotificationDeps } from '../booking/notifications';

const { applications, clients, contacts } = schema;

async function applicationSummary(applicationId: string, deps: NotificationDeps) {
  const [row] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        organizationId: applications.organizationId,
        dealId: applications.dealId,
        path: applications.path,
        score: applications.score,
        answers: applications.answers,
        reviewDecision: applications.reviewDecision,
        companyName: clients.name,
        contactName: contacts.fullName,
      })
      .from(applications)
      .innerJoin(clients, eq(clients.id, applications.clientId))
      .innerJoin(contacts, eq(contacts.id, applications.contactId))
      .where(eq(applications.id, applicationId)),
  );
  return row ?? null;
}

export async function alertNewApplication(
  applicationId: string,
  deps: NotificationDeps,
): Promise<boolean> {
  const summary = await applicationSummary(applicationId, deps);
  if (!summary || summary.path === 'c') return false;
  const texts = (summary.answers as { texts?: Record<string, string> }).texts ?? {};

  await alertFounders(
    summary.organizationId,
    'founder.application_received',
    {
      companyName: summary.companyName,
      contactName: summary.contactName,
      path: summary.path === 'a' ? 'A' : 'B',
      score: summary.score,
      costOfInaction: texts.cost_of_inaction ?? '—',
      dealUrl: new URL(`/pipeline/${summary.dealId}`, deps.appBaseUrl).toString(),
    },
    deps,
  );
  return true;
}

export async function remindPendingQueueB(
  applicationId: string,
  deps: NotificationDeps,
): Promise<boolean> {
  const summary = await applicationSummary(applicationId, deps);
  if (!summary || summary.path !== 'b' || summary.reviewDecision !== null) return false;

  await alertFounders(
    summary.organizationId,
    'founder.queue_b_pending',
    {
      companyName: summary.companyName,
      queueUrl: new URL('/applications?tab=queue_b', deps.appBaseUrl).toString(),
    },
    deps,
  );
  return true;
}
