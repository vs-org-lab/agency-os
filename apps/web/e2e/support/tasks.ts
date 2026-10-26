import { randomUUID } from 'node:crypto';
import { database } from './admin';

/**
 * A client of its own with a deal and a payment already recorded as dispatched, so the outbox never
 * delivers it and no notice goes out; the studio feed reads it like any received payment.
 */
export async function seedReceivedPayment(
  organizationId: string,
): Promise<{ clientId: string; dealId: string; company: string }> {
  const suffix = randomUUID().slice(0, 8);
  const company = `Feed E2E ${suffix}`;
  const sql = database();
  try {
    const clientId = randomUUID();
    await sql`
      insert into public.clients (id, organization_id, name, lifecycle)
      values (${clientId}, ${organizationId}, ${company}, 'active')
    `;
    const [deal] = await sql<{ id: string }[]>`
      insert into public.deals (organization_id, client_id, title, pipeline_code, source)
      values (${organizationId}, ${clientId}, ${company}, '2.2', 'acquisition')
      returning id
    `;
    if (!deal) throw new Error('Feed deal was not created');
    await sql`
      insert into public.domain_events (organization_id, client_id, type, payload, status,
                                        dispatched_at)
      values (${organizationId}, ${clientId}, 'billing.payment.received',
              ${JSON.stringify({ dealId: deal.id })}::jsonb, 'dispatched', now())
    `;
    return { clientId, dealId: deal.id, company };
  } finally {
    await sql.end();
  }
}

/** An open task of the room's project, so its panel can link files from that project's library. */
export async function seedProjectTask(
  organizationId: string,
  clientId: string,
  dealId: string,
  title: string,
): Promise<{ taskId: string; projectId: string }> {
  const sql = database();
  try {
    const [project] = await sql<{ id: string }[]>`
      select id from public.projects where deal_id = ${dealId}
    `;
    if (!project) throw new Error('Project of the deal was not found');
    const [task] = await sql<{ id: string }[]>`
      insert into public.tasks (organization_id, client_id, project_id, title)
      values (${organizationId}, ${clientId}, ${project.id}, ${title})
      returning id
    `;
    if (!task) throw new Error('Project task was not created');
    return { taskId: task.id, projectId: project.id };
  } finally {
    await sql.end();
  }
}

/** A ready library file in a new internal root folder of the project; no object is stored. */
export async function seedLibraryFile(
  organizationId: string,
  clientId: string,
  projectId: string,
  name: string,
): Promise<{ fileId: string }> {
  const sql = database();
  try {
    const folderId = randomUUID();
    await sql`
      insert into public.library_folders (id, organization_id, client_id, project_id, root_id,
                                          depth, name, visibility)
      values (${folderId}, ${organizationId}, ${clientId}, ${projectId}, ${folderId}, 0,
              'Entregas E2E', 'internal')
    `;
    const [file] = await sql<{ id: string }[]>`
      insert into public.library_files (organization_id, client_id, project_id, folder_id,
                                        root_id, name, storage_path, kind, mime_type, size_bytes,
                                        status)
      values (${organizationId}, ${clientId}, ${projectId}, ${folderId}, ${folderId}, ${name},
              ${`e2e/${randomUUID()}`}, 'document', 'application/pdf', 1024, 'ready')
      returning id
    `;
    if (!file) throw new Error('Library file was not created');
    return { fileId: file.id };
  } finally {
    await sql.end();
  }
}
