import { randomUUID } from 'node:crypto';
import {
  DEFAULT_BRIEFING_GUIDE,
  DEFAULT_ORBIT_GRID,
} from '../../src/modules/diagnosis/templates/defaults';
import { database } from './admin';

/** A one-pixel PNG used as audit evidence. */
export const EVIDENCE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function activeTemplate(
  sql: ReturnType<typeof database>,
  organizationId: string,
  kind: 'briefing' | 'orbit_grid',
): Promise<string> {
  const [existing] = await sql<{ id: string }[]>`
    select id from public.core_templates
    where organization_id = ${organizationId} and kind = ${kind} and is_active
  `;
  if (existing) return existing.id;
  const definition = kind === 'briefing' ? DEFAULT_BRIEFING_GUIDE : DEFAULT_ORBIT_GRID;
  const [created] = await sql<{ id: string }[]>`
    insert into public.core_templates (organization_id, kind, version, definition, is_active)
    values (${organizationId}, ${kind}, 1, ${JSON.stringify(definition)}::jsonb, true)
    returning id
  `;
  return created?.id ?? '';
}

/** Creates the Core of a deal, as the booking automation does. */
export async function seedCore(
  organizationId: string,
  dealId: string,
  options: { code?: '1.1' } = {},
): Promise<string> {
  const sql = database();
  try {
    if (options.code) {
      await sql`update public.deals set pipeline_code = ${options.code} where id = ${dealId}`;
    }
    const [deal] = await sql<{ clientId: string }[]>`
      select client_id as "clientId" from public.deals where id = ${dealId}
    `;
    const briefing = await activeTemplate(sql, organizationId, 'briefing');
    const grid = await activeTemplate(sql, organizationId, 'orbit_grid');
    const [engagement] = await sql<{ id: string }[]>`
      insert into public.core_engagements (organization_id, client_id, deal_id,
                                           briefing_template_id, grid_template_id)
      values (${organizationId}, ${deal?.clientId ?? ''}, ${dealId}, ${briefing}, ${grid})
      on conflict (deal_id) do update set updated_at = now()
      returning id
    `;
    return engagement?.id ?? '';
  } finally {
    await sql.end();
  }
}

/** Gives the e2e client an open deal at 1.6 with a shared briefing and presentation. */
export async function seedSharedCore(
  organizationId: string,
  clientId: string,
): Promise<{ dealId: string; note: string; presentation: string }> {
  const sql = database();
  const note = `Clientes chegam por indicação ${randomUUID().slice(0, 6)}`;
  const presentation = `Sessão de proposta ${randomUUID().slice(0, 6)}`;
  try {
    const [open] = await sql<{ id: string }[]>`
      select id from public.deals
      where client_id = ${clientId} and pipeline_code not in ('X.3', 'X.4') and archived_at is null
      limit 1
    `;
    const dealId =
      open?.id ??
      (
        await sql<{ id: string }[]>`
          insert into public.deals (organization_id, client_id, title, pipeline_code, source)
          values (${organizationId}, ${clientId}, 'Core E2E', '1.6', 'acquisition')
          returning id
        `
      )[0]?.id ??
      '';
    const briefing = await activeTemplate(sql, organizationId, 'briefing');
    const grid = await activeTemplate(sql, organizationId, 'orbit_grid');
    const [engagement] = await sql<{ id: string }[]>`
      insert into public.core_engagements (organization_id, client_id, deal_id,
                                           briefing_template_id, grid_template_id,
                                           transcript, briefing_shared_at)
      values (${organizationId}, ${clientId}, ${dealId}, ${briefing}, ${grid},
              'Transcrição interna', now())
      on conflict (deal_id) do update set briefing_shared_at = now(), transcript = 'Transcrição interna'
      returning id
    `;
    await sql`
      insert into public.core_briefing_notes (organization_id, client_id, engagement_id, block_id, body)
      values (${organizationId}, ${clientId}, ${engagement?.id ?? ''}, 'brand_today', ${note})
      on conflict (engagement_id, block_id, question_id) do update set body = excluded.body
    `;
    await sql`
      insert into public.documents (organization_id, client_id, deal_id, kind, title, url, status, shared_at)
      values (${organizationId}, ${clientId}, ${dealId}, 'figma_presentation', ${presentation},
              'https://www.figma.com/deck/AbC123/Core-E2E', 'with_client', now())
    `;
    await sql`
      insert into public.documents (organization_id, client_id, deal_id, kind, title, url)
      values (${organizationId}, ${clientId}, ${dealId}, 'figma_presentation', 'Rascunho interno',
              'https://www.figma.com/deck/AbC123/Rascunho')
    `;
    return { dealId, note, presentation };
  } finally {
    await sql.end();
  }
}
