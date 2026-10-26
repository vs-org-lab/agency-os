import './load-env';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { and, asc, eq, sql } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { createMemoryBillingStorage } from '@/modules/billing/storage';
import type { BrandHubDeps } from '@/modules/brand-hub/access';
import { createBrandHub, updateHubDesign } from '@/modules/brand-hub/hubs';
import { addHubBlock, updateHubBlock } from '@/modules/brand-hub/blocks';
import { addHubPage } from '@/modules/brand-hub/pages';
import { DEFAULT_HUB_DESIGN } from '@/modules/brand-hub/domain/design';
import type { LibraryStorage } from '@/modules/library';
import type { RetainersDeps } from '@/modules/retainers/access';
import { saveRetainer } from '@/modules/retainers/retainers';
import { recordUsage } from '@/modules/retainers/usage';
import { createProjectAsStaff } from '@/modules/rooms/projects';
import { setStepStatus, startPhase } from '@/modules/rooms/process';
import type { RoomsDeps } from '@/modules/rooms/runtime-types';
import { ensureProcessTemplates } from '@/modules/rooms/templates/service';
import { publishUpdate } from '@/modules/rooms/updates';
import { createTask, setTaskItem, setTaskStatus, type TasksDeps } from '@/modules/tasks/service';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';

const { clients, contacts, organizationMemberships, projectPhases, projectSteps, projects } =
  schema;

const DEMO_CLIENT_NAME = 'Estúdio Demo';
const DAY_MS = 24 * 60 * 60 * 1000;
const USAGE = 'Usage: pnpm --filter web seed:demo --founder-email <email>';

const contexts = { withUserContext, withSystemContext };
const roomsDeps: RoomsDeps = { contexts, moveDeal: async () => {}, flush: async () => {} };
const tasksDeps: TasksDeps = { contexts };
const retainersDeps: RetainersDeps = {
  contexts,
  billing: { storage: createMemoryBillingStorage(), appBaseUrl: 'https://demo.invalid' },
  flush: async () => {},
};

/** The demo hub holds no uploaded files, so any storage access is a mistake. */
function unusedStorage(): LibraryStorage {
  const refuse = async (): Promise<never> => {
    throw new Error('The demo seed does not use file storage');
  };
  return {
    createUploadUrl: refuse,
    download: refuse,
    exists: refuse,
    signedDownloadUrl: refuse,
    signedUrl: refuse,
    upload: refuse,
    remove: refuse,
    removeMany: refuse,
  };
}
const hubDeps: BrandHubDeps = { contexts, storage: unusedStorage(), flush: async () => {} };

function founderClaims(userId: string): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
    user_kind: 'internal',
  };
}

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

function expectOk<T extends { ok: boolean }>(label: string, result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}

async function resolveFounder(email: string): Promise<{ userId: string; organizationId: string }> {
  return withSystemContext(async (tx) => {
    const [user] = await tx.execute<{ id: string }>(
      sql`select id from auth.users where lower(email) = ${email.trim().toLowerCase()}`,
    );
    if (!user) throw new Error(`No user found with the email ${email}`);
    const [membership] = await tx
      .select({ organizationId: organizationMemberships.organizationId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.userId, user.id),
          eq(organizationMemberships.role, 'founder'),
          eq(organizationMemberships.status, 'active'),
        ),
      )
      .limit(1);
    if (!membership) throw new Error(`${email} is not an active founder of any organization`);
    return { userId: user.id, organizationId: membership.organizationId };
  });
}

async function findDemoClient(organizationId: string) {
  return withSystemContext(async (tx) => {
    const [client] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(
          eq(clients.organizationId, organizationId),
          eq(clients.name, DEMO_CLIENT_NAME),
          eq(clients.lifecycle, 'active'),
        ),
      )
      .limit(1);
    if (!client) return null;
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.clientId, client.id))
      .limit(1);
    return { clientId: client.id, projectId: project?.id ?? null };
  });
}

async function ensureDemoClient(organizationId: string, existingId: string | null) {
  if (existingId) return existingId;
  return withSystemContext(async (tx) => {
    const [client] = await tx
      .insert(clients)
      .values({
        organizationId,
        name: DEMO_CLIENT_NAME,
        sector: 'Café de especialidade',
        website: 'https://example.com',
        lifecycle: 'active',
      })
      .returning({ id: clients.id });
    if (!client) throw new Error('The demo client was not created');
    await tx.insert(contacts).values({
      organizationId,
      clientId: client.id,
      fullName: 'Marta Exemplo',
      email: 'marta.exemplo@example.com',
      jobTitle: 'Diretora de marca',
      role: 'decision_maker',
    });
    return client.id;
  });
}

async function seedProject(claims: VerifiedClaims, organizationId: string, clientId: string) {
  await withSystemContext((tx) => ensureProcessTemplates(tx, organizationId));
  const created = expectOk(
    'Project creation',
    await createProjectAsStaff(claims, { clientId, name: 'Rebrand' }, roomsDeps),
  );
  const projectId = created.projectId;

  const phases = await withSystemContext((tx) =>
    tx
      .select({ id: projectPhases.id })
      .from(projectPhases)
      .where(eq(projectPhases.projectId, projectId))
      .orderBy(asc(projectPhases.position)),
  );
  const firstPhase = phases[0];
  if (!firstPhase) throw new Error('The process template created no phases');
  expectOk('Phase start', await startPhase(claims, { phaseId: firstPhase.id }, roomsDeps));

  const steps = await withSystemContext((tx) =>
    tx
      .select({ id: projectSteps.id })
      .from(projectSteps)
      .where(eq(projectSteps.phaseId, firstPhase.id))
      .orderBy(asc(projectSteps.position)),
  );
  for (const step of steps.slice(0, 2)) {
    expectOk(
      'Step done',
      await setStepStatus(claims, { stepId: step.id, status: 'done' }, roomsDeps),
    );
  }
  return projectId;
}

async function seedUpdates(claims: VerifiedClaims, projectId: string) {
  const updates = [
    {
      body: 'Arrancámos o rebrand do Estúdio Demo. A fase de descoberta está em curso.',
      milestone: 'Arranque do projeto',
      visibility: 'client' as const,
    },
    {
      body: 'O questionário de descoberta foi concluído e a análise técnica já começou.',
      milestone: null,
      visibility: 'client' as const,
    },
    {
      body: 'Nota interna: validar referências visuais antes da reunião de apresentação.',
      milestone: null,
      visibility: 'internal' as const,
    },
  ];
  for (const update of updates) {
    expectOk('Project update', await publishUpdate(claims, { projectId, ...update }, roomsDeps));
  }
}

async function seedTasks(
  claims: VerifiedClaims,
  clientId: string,
  projectId: string,
  assigneeId: string,
) {
  const base = { clientId, projectId, assigneeId };
  const definitions = [
    { title: 'Rever o questionário de descoberta', dueOn: isoDay(-3), done: true },
    { title: 'Enviar proposta de arquitetura de marca', dueOn: isoDay(-1), done: false },
    {
      title: 'Preparar a apresentação de conceitos',
      dueOn: isoDay(0),
      done: false,
      notes: 'Incluir três direções criativas e a justificação de cada uma.',
      items: [
        'Recolher referências visuais',
        'Definir as três direções',
        'Montar os slides',
        'Ensaiar a apresentação',
      ],
    },
    { title: 'Marcar reunião de alinhamento com a cliente', dueOn: isoDay(2), done: false },
    { title: 'Atualizar o guia de tom de voz', dueOn: isoDay(5), done: false },
    { title: 'Selecionar paleta e tipografia finalistas', dueOn: isoDay(9), done: false },
    { title: 'Organizar a pasta de ativos finais', dueOn: null, done: false },
  ];
  const created: { taskId: string; hasItems: boolean }[] = [];
  for (const { done, ...definition } of definitions) {
    const result = expectOk(
      'Task creation',
      await createTask(claims, { ...base, ...definition }, tasksDeps),
    );
    if (done) {
      expectOk(
        'Task status',
        await setTaskStatus(claims, { taskId: result.taskId, status: 'done' }, tasksDeps),
      );
    }
    created.push({ taskId: result.taskId, hasItems: 'items' in definition });
  }

  const withItems = created.find((task) => task.hasItems);
  if (!withItems) return;
  const items = await withSystemContext((tx) =>
    tx.execute<{ id: string }>(
      sql`select id from public.task_items where task_id = ${withItems.taskId}::uuid order by position`,
    ),
  );
  for (const item of items.slice(0, 2)) {
    expectOk('Task item', await setTaskItem(claims, { itemId: item.id, done: true }, tasksDeps));
  }
}

async function seedRetainer(claims: VerifiedClaims, clientId: string, projectId: string) {
  const startsOn = isoDay(0).slice(0, 8) + '01';
  const saved = expectOk(
    'Retainer',
    await saveRetainer(
      claims,
      {
        clientId,
        projectId,
        tier: 'Crescimento',
        monthlyFee: '1500.00',
        currency: 'EUR',
        startsOn,
        reviewOn: isoDay(90),
        limits: [
          { kind: 'content_pieces', monthlyLimit: '10' },
          { kind: 'campaigns', monthlyLimit: '2' },
          { kind: 'maintenance_hours', monthlyLimit: '8' },
          { kind: 'automations', monthlyLimit: '4' },
        ],
      },
      retainersDeps,
    ),
  );
  const usage = [
    {
      kind: 'content_pieces',
      quantity: '4',
      description: 'Posts de lançamento da nova identidade',
    },
    { kind: 'campaigns', quantity: '1', description: 'Campanha de apresentação da marca' },
    { kind: 'maintenance_hours', quantity: '3.5', description: 'Ajustes ao site institucional' },
    { kind: 'automations', quantity: '1', description: 'Automação de boas-vindas por email' },
  ];
  for (const entry of usage) {
    expectOk(
      'Retainer usage',
      await recordUsage(claims, { retainerId: saved.id, ...entry }, retainersDeps),
    );
  }
  return saved.id;
}

async function seedBrandHub(claims: VerifiedClaims, clientId: string) {
  const hub = expectOk('Brand hub', await createBrandHub(claims, { clientId }, hubDeps));
  expectOk(
    'Hub design',
    await updateHubDesign(
      claims,
      {
        hubId: hub.hubId,
        design: {
          ...DEFAULT_HUB_DESIGN,
          colors: { ...DEFAULT_HUB_DESIGN.colors, accent: '#0A7FD1', text: '#0F2A42' },
        },
      },
      hubDeps,
    ),
  );

  const blocks = await withSystemContext((tx) =>
    tx.execute<{ id: string; type: string; standard_key: string | null }>(sql`
      select b.id, b.type, p.standard_key
      from public.brand_hub_blocks b
      join public.brand_hub_pages p on p.id = b.page_id
      where b.hub_id = ${hub.hubId}::uuid
    `),
  );
  const blockFor = (key: string) => {
    const block = blocks.find((row) => row.standard_key === key);
    if (!block) throw new Error(`Brand hub starter block for ${key} is missing`);
    return block.id;
  };
  const content = {
    strategy: {
      story: 'O Estúdio Demo nasceu de uma paixão por café de origem única e por quem o prepara.',
      mission: 'Tornar o café de especialidade acessível, honesto e memorável.',
      vision: 'Ser a referência de torrefação artesanal na cidade.',
      values: 'Origem, cuidado, transparência, comunidade.',
      voice: 'Próxima, curiosa e direta, sem jargão.',
      positioning: 'Café de especialidade para o dia a dia, sem snobismo.',
    },
    colors: {
      swatches: [
        { name: 'Azul Aurion', hex: '#0A7FD1', notes: 'Cor principal' },
        { name: 'Âmbar', hex: '#F0B342', notes: 'Destaques e chamadas' },
        { name: 'Azul profundo', hex: '#0F2A42', notes: 'Texto e fundos escuros' },
      ],
    },
    typeface: {
      family: 'Inter',
      weights: ['Regular', 'Medium', 'Bold'],
      sample: 'Café com origem, feito com cuidado.',
      assetId: null,
    },
  };
  for (const key of ['strategy', 'color', 'typography'] as const) {
    const payload =
      key === 'strategy' ? content.strategy : key === 'color' ? content.colors : content.typeface;
    expectOk(
      `Hub block ${key}`,
      await updateHubBlock(claims, { blockId: blockFor(key), content: payload }, hubDeps),
    );
  }

  const page = expectOk(
    'Hub page',
    await addHubPage(claims, { hubId: hub.hubId, title: 'Tom de voz' }, hubDeps),
  );
  const block = expectOk(
    'Hub block',
    await addHubBlock(claims, { pageId: page.pageId, type: 'text' }, hubDeps),
  );
  expectOk(
    'Hub block text',
    await updateHubBlock(
      claims,
      {
        blockId: block.blockId,
        content: {
          title: 'Como falamos',
          body: 'Frases curtas, verbos no presente e nomes de origem sempre corretos.',
        },
      },
      hubDeps,
    ),
  );
  return hub.hubId;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { 'founder-email': { type: 'string' } } });
  const email = values['founder-email'];
  if (!email) {
    console.error(USAGE);
    process.exit(1);
  }

  const { userId, organizationId } = await resolveFounder(email);
  const existing = await findDemoClient(organizationId);
  if (existing?.projectId) {
    console.log(`Demo client already seeded: ${JSON.stringify({ organizationId, ...existing })}`);
    return;
  }

  const claims = founderClaims(userId);
  const clientId = await ensureDemoClient(organizationId, existing?.clientId ?? null);
  const projectId = await seedProject(claims, organizationId, clientId);
  await seedUpdates(claims, projectId);
  await seedTasks(claims, clientId, projectId, userId);
  const retainerId = await seedRetainer(claims, clientId, projectId);
  const hubId = await seedBrandHub(claims, clientId);
  console.log(
    `Demo client seeded: ${JSON.stringify({ organizationId, clientId, projectId, retainerId, hubId })}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
