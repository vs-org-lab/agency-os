import { database } from './admin';

/** Adds a second project, with one phase, to a seeded room client. */
export async function addSecondProject(
  organizationId: string,
  clientId: string,
  name: string,
): Promise<string> {
  const sql = database();
  try {
    const [project] = await sql<{ id: string }[]>`
      insert into public.projects (organization_id, client_id, name, template_key, template_version,
                                   starts_on)
      values (${organizationId}, ${clientId}, ${name}, 'orbit', 1, current_date)
      returning id
    `;
    if (!project) throw new Error('Second project was not created');
    await sql`
      insert into public.project_phases (organization_id, client_id, project_id, position, name,
                                         requires_approval)
      values (${organizationId}, ${clientId}, ${project.id}, 1, 'Conceito', false)
    `;
    return project.id;
  } finally {
    await sql.end();
  }
}

/** The acceptance path of the latest invitation the OS emailed to this address. */
export async function capturedInvitationPath(recipient: string): Promise<string> {
  const sql = database();
  try {
    const [email] = await sql<{ text: string }[]>`
      select text from public.captured_emails
      where recipient = ${recipient} and template = 'team.invitation'
      order by created_at desc limit 1
    `;
    const match = email?.text.match(/https?:\/\/\S+\/accept-invitation\?\S+/);
    if (!match) throw new Error(`No invitation email captured for ${recipient}`);
    const url = new URL(match[0]);
    return `${url.pathname}${url.search}`;
  } finally {
    await sql.end();
  }
}
