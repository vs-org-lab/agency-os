import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { VerifiedClaims } from '@/platform/db';
import { roomActor } from './authorize';
import type { RoomsDeps } from './runtime-types';
import { activeProcessTemplate, type ProcessTemplate } from './templates/service';

const { contracts, deals, projectPhases, projectSteps, projectUpdates, projects, proposalOptions } =
  schema;

const LISBON_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });

type NewProject = {
  organizationId: string;
  clientId: string;
  dealId: string | null;
  name: string;
  template: ProcessTemplate;
  createdBy: string | null;
};

/** Inserts the project with its own copy of the template's phases and steps (spec decision 1). */
async function insertProject(tx: DbTransaction, input: NewProject, now: Date): Promise<string> {
  const [project] = await tx
    .insert(projects)
    .values({
      organizationId: input.organizationId,
      clientId: input.clientId,
      dealId: input.dealId,
      name: input.name,
      templateKey: input.template.key,
      templateVersion: input.template.version,
      startsOn: LISBON_DATE.format(now),
      createdBy: input.createdBy,
    })
    .returning({ id: projects.id });
  if (!project) throw new Error('Project was not created');

  for (const [phaseIndex, phase] of input.template.definition.phases.entries()) {
    const [phaseRow] = await tx
      .insert(projectPhases)
      .values({
        organizationId: input.organizationId,
        clientId: input.clientId,
        projectId: project.id,
        position: phaseIndex + 1,
        name: phase.name,
        requiresApproval: phase.requiresApproval,
        codeOnStart: phase.codeOnStart,
        codeOnDone: phase.codeOnDone,
      })
      .returning({ id: projectPhases.id });
    if (!phaseRow) throw new Error('Project phase was not created');
    await tx.insert(projectSteps).values(
      phase.steps.map((step, stepIndex) => ({
        organizationId: input.organizationId,
        clientId: input.clientId,
        projectId: project.id,
        phaseId: phaseRow.id,
        position: stepIndex + 1,
        name: step.name,
        visibleToClient: step.visibleToClient,
        chained: step.chained,
      })),
    );
  }

  await tx.insert(projectUpdates).values({
    organizationId: input.organizationId,
    clientId: input.clientId,
    projectId: project.id,
    authorId: input.createdBy,
    kind: 'project_started',
    body: input.name,
    visibility: 'client',
  });
  await recordAudit(tx, {
    organizationId: input.organizationId,
    action: 'project.created',
    resourceType: 'project',
    resourceId: project.id,
    clientId: input.clientId,
    metadata: { dealId: input.dealId, template: input.template.key },
  });
  await emit(tx, {
    type: 'rooms.project.created',
    organizationId: input.organizationId,
    clientId: input.clientId,
    payload: { projectId: project.id, dealId: input.dealId },
  });
  return project.id;
}

async function dealProject(tx: DbTransaction, dealId: string): Promise<string | null> {
  const [existing] = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.dealId, dealId));
  return existing?.id ?? null;
}

/**
 * Starts the deal's project with the default process when it reaches 2.2 (AUT-13). Runs once per
 * deal: a repeated event finds the project and stops.
 */
export async function createProjectForDeal(
  dealId: string,
  deps: RoomsDeps,
): Promise<{ created: boolean; projectId: string | null }> {
  if (!z.uuid().safeParse(dealId).success) return { created: false, projectId: null };
  const now = (deps.now ?? (() => new Date()))();

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const [deal] = await tx
      .select({
        id: deals.id,
        organizationId: deals.organizationId,
        clientId: deals.clientId,
        title: deals.title,
      })
      .from(deals)
      .where(eq(deals.id, dealId))
      .for('update');
    if (!deal) return { created: false, projectId: null };
    const existing = await dealProject(tx, deal.id);
    if (existing) return { created: false, projectId: existing };

    const template = await activeProcessTemplate(tx, deal.organizationId);
    if (!template) throw new Error('Default process template is missing');
    const [option] = await tx
      .select({ name: proposalOptions.name })
      .from(contracts)
      .innerJoin(proposalOptions, eq(proposalOptions.id, contracts.optionId))
      .where(and(eq(contracts.dealId, deal.id), eq(contracts.status, 'signed')))
      .limit(1);
    const projectId = await insertProject(
      tx,
      {
        organizationId: deal.organizationId,
        clientId: deal.clientId,
        dealId: deal.id,
        name: option?.name ?? deal.title,
        template,
        createdBy: null,
      },
      now,
    );
    return { created: true, projectId };
  });

  if (result.created) await (deps.flush ?? requestFlush)();
  return result;
}

const staffProjectSchema = z.object({
  clientId: z.uuid(),
  dealId: z.uuid().optional(),
  name: z.string().trim().min(1).max(120),
  templateKey: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,39}$/)
    .optional(),
});

export type CreateProjectResult =
  | { ok: true; projectId: string }
  | { ok: false; rule: 'not_found' | 'invalid_input' | 'deal_has_project' };

/** "Novo projeto" in the room: the founder or the client's project manager starts a project. */
export async function createProjectAsStaff(
  claims: VerifiedClaims,
  input: { clientId: string; dealId?: string; name: string; templateKey?: string },
  deps: RoomsDeps,
): Promise<CreateProjectResult> {
  const actor = await roomActor(deps.contexts, claims, input.clientId, 'write');
  if (!actor) return { ok: false, rule: 'not_found' };
  const parsed = staffProjectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, rule: 'invalid_input' };
  const data = parsed.data;
  const now = (deps.now ?? (() => new Date()))();

  const result = await deps.contexts.withSystemContext(async (tx): Promise<CreateProjectResult> => {
    if (data.dealId) {
      const [deal] = await tx
        .select({ id: deals.id })
        .from(deals)
        .where(and(eq(deals.id, data.dealId), eq(deals.clientId, data.clientId)))
        .for('update');
      if (!deal) return { ok: false, rule: 'not_found' };
      if (await dealProject(tx, deal.id)) return { ok: false, rule: 'deal_has_project' };
    }
    const template = await activeProcessTemplate(tx, actor.organizationId, data.templateKey);
    if (!template) return { ok: false, rule: 'not_found' };
    const projectId = await insertProject(
      tx,
      {
        organizationId: actor.organizationId,
        clientId: data.clientId,
        dealId: data.dealId ?? null,
        name: data.name,
        template,
        createdBy: actor.userId,
      },
      now,
    );
    return { ok: true, projectId };
  });

  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}
