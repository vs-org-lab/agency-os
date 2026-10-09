import { randomUUID } from 'node:crypto';
import { ORBIT_PROCESS } from '../../src/modules/rooms/templates/defaults';
import { adminClient, database } from './admin';

export const ROOM_DECISION_MAKER = 'Marta Lopes';

/**
 * A client of its own with a decision maker in the portal and a deal at 2.2 whose project already
 * copied the Orbit process, as the kickoff automation leaves it.
 */
export async function seedRoomProject(
  organizationId: string,
): Promise<{ clientId: string; dealId: string; company: string; decisionMakerEmail: string }> {
  const suffix = randomUUID().slice(0, 8);
  const company = `Sala E2E ${suffix}`;
  const decisionMakerEmail = `e2e-room-${suffix}@e2e.agency-os.dev`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email: decisionMakerEmail,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Decision maker creation failed: ${error?.message}`);
  const userId = data.user.id;

  const sql = database();
  try {
    const clientId = randomUUID();
    await sql`
      insert into public.profiles (id, full_name, kind) values (${userId}, ${ROOM_DECISION_MAKER}, 'client')
      on conflict (id) do update set full_name = excluded.full_name, kind = excluded.kind
    `;
    await sql`
      insert into public.clients (id, organization_id, name, lifecycle)
      values (${clientId}, ${organizationId}, ${company}, 'active')
    `;
    await sql`
      insert into public.client_memberships (organization_id, client_id, user_id, role, status)
      values (${organizationId}, ${clientId}, ${userId}, 'decision_maker', 'active')
    `;
    await sql`
      insert into public.contacts (organization_id, client_id, full_name, email, role, portal_user_id)
      values (${organizationId}, ${clientId}, ${ROOM_DECISION_MAKER}, ${decisionMakerEmail},
              'decision_maker', ${userId})
    `;
    const [deal] = await sql<{ id: string }[]>`
      insert into public.deals (organization_id, client_id, title, pipeline_code, source)
      values (${organizationId}, ${clientId}, ${company}, '2.2', 'acquisition')
      returning id
    `;
    if (!deal) throw new Error('Room deal was not created');
    const [project] = await sql<{ id: string }[]>`
      insert into public.projects (organization_id, client_id, deal_id, name, template_key,
                                   template_version, starts_on)
      values (${organizationId}, ${clientId}, ${deal.id}, 'Website', 'orbit', 1, current_date)
      returning id
    `;
    if (!project) throw new Error('Room project was not created');
    for (const [phaseIndex, phase] of ORBIT_PROCESS.phases.entries()) {
      const [phaseRow] = await sql<{ id: string }[]>`
        insert into public.project_phases (organization_id, client_id, project_id, position, name,
                                           requires_approval, code_on_start, code_on_done)
        values (${organizationId}, ${clientId}, ${project.id}, ${phaseIndex + 1}, ${phase.name},
                ${phase.requiresApproval}, ${phase.codeOnStart}, ${phase.codeOnDone})
        returning id
      `;
      if (!phaseRow) throw new Error('Room phase was not created');
      for (const [stepIndex, step] of phase.steps.entries()) {
        await sql`
          insert into public.project_steps (organization_id, client_id, project_id, phase_id,
                                            position, name, visible_to_client, chained)
          values (${organizationId}, ${clientId}, ${project.id}, ${phaseRow.id}, ${stepIndex + 1},
                  ${step.name}, ${step.visibleToClient}, ${step.chained})
        `;
      }
    }
    return { clientId, dealId: deal.id, company, decisionMakerEmail };
  } finally {
    await sql.end();
  }
}
