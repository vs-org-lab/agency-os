import { createHmac, randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { database } from './admin';

export type ApplicationAnswers = {
  role: string;
  sector: string;
  revenue: string;
  priority: string;
  investment: string;
  timing: string;
};

export const PATH_A: ApplicationAnswers = {
  role: 'CEO, fundador ou sócio',
  sector: 'Consultoria',
  revenue: 'Mais de €20M',
  priority: 'Reconstruir marca e site',
  investment: 'Mais de €50k',
  timing: 'Este trimestre',
};

export const PATH_B: ApplicationAnswers = {
  role: 'Diretor',
  sector: 'Outro',
  revenue: '€1M a €5M',
  priority: 'Integrar ferramentas e automatizar',
  investment: '€10k a €25k',
  timing: 'Este trimestre',
};

export const PATH_C: ApplicationAnswers = { ...PATH_A, investment: 'Menos de €10k' };

export function uniqueCompany(prefix: string): { company: string; email: string } {
  const suffix = randomUUID().slice(0, 8);
  return { company: `${prefix} ${suffix}`, email: `lead-${suffix}@e2e.agency-os.dev` };
}

export async function fillApplication(
  page: Page,
  input: { company: string; email: string; answers: ApplicationAnswers },
): Promise<void> {
  await page.goto('/apply');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Nome').fill('Teste Automático');
  await page.getByLabel('Email profissional').fill(input.email);
  await page.getByRole('button', { name: 'Seguinte' }).click();
  await page.getByLabel('Empresa', { exact: true }).fill(input.company);
  await page.getByRole('button', { name: 'Seguinte' }).click();
  for (const option of [
    input.answers.role,
    input.answers.sector,
    input.answers.revenue,
    input.answers.priority,
    input.answers.investment,
    input.answers.timing,
  ]) {
    await page.getByRole('radio', { name: option, exact: true }).click();
    await page.getByRole('button', { name: 'Seguinte' }).click();
  }
  await page.getByRole('textbox').fill('Perdemos dois contratos por ano.');
  await page.getByRole('checkbox').click();
  await page.waitForTimeout(3200);
}

export async function submitApplication(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Enviar candidatura' }).click();
  await expect(page).toHaveURL(/\/apply\/thanks/);
}

export function bookingLinkFor(dealId: string): string {
  const secret = process.env.PUBLIC_LINK_SECRET;
  if (!secret) throw new Error('PUBLIC_LINK_SECRET is not set');
  const payload = Buffer.from(
    JSON.stringify({ p: 'booking_link', e: Date.now() + 86_400_000, d: { dealId } }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `/apply/book?token=${encodeURIComponent(`${payload}.${signature}`)}`;
}

export async function dealIdForCompany(company: string): Promise<string> {
  const sql = database();
  try {
    const [row] = await sql<{ id: string }[]>`
      select d.id from public.deals d join public.clients c on c.id = d.client_id
      where c.name = ${company} order by d.created_at desc limit 1
    `;
    if (!row) throw new Error(`No deal for ${company}`);
    return row.id;
  } finally {
    await sql.end();
  }
}

export async function seedDeal(
  organizationId: string,
  input: { company: string; code: '0.2' | '0.3'; withCall?: boolean; lifecycle?: 'prospect' },
): Promise<{ dealId: string; clientId: string }> {
  const sql = database();
  try {
    const clientId = randomUUID();
    await sql`
      insert into public.clients (id, organization_id, name, lifecycle)
      values (${clientId}, ${organizationId}, ${input.company}, 'prospect')
    `;
    const [contact] = await sql<{ id: string }[]>`
      insert into public.contacts (organization_id, client_id, full_name, email, role)
      values (${organizationId}, ${clientId}, 'Contacto Teste', ${`contact-${clientId}@e2e.agency-os.dev`}, 'decision_maker')
      returning id
    `;
    const [deal] = await sql<{ id: string }[]>`
      insert into public.deals (organization_id, client_id, title, pipeline_code, source)
      values (${organizationId}, ${clientId}, ${input.company}, ${input.code}, 'acquisition')
      returning id
    `;
    if (input.withCall) {
      const [host] = await sql<{ id: string }[]>`
        select user_id as id from public.organization_memberships
        where organization_id = ${organizationId} and role = 'founder' limit 1
      `;
      await sql`
        insert into public.calls (organization_id, client_id, deal_id, contact_id, host_user_id, starts_at, ends_at)
        values (${organizationId}, ${clientId}, ${deal?.id ?? ''}, ${contact?.id ?? ''}, ${host?.id ?? ''},
                now() + interval '3 days', now() + interval '3 days 45 minutes')
      `;
    }
    return { dealId: deal?.id ?? '', clientId };
  } finally {
    await sql.end();
  }
}
