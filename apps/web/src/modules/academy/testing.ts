import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { testDatabase, type World } from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import type { AcademyDeps } from './access';

export function academyClaims(
  userId: string,
  userKind: 'internal' | 'client' = 'internal',
): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: userKind === 'internal' ? 'aal2' : 'aal1',
    session_id: randomUUID(),
    amr: [
      {
        method: userKind === 'internal' ? 'totp' : 'otp',
        timestamp: Math.floor(Date.now() / 1000),
      },
    ],
    user_kind: userKind,
  };
}

export function academyDeps(sql: TransactionSql): AcademyDeps {
  return { contexts: createDbContexts(testDatabase(sql)) };
}

/** An academy item written straight to the table, for readers and checks. */
export async function seedAcademyItem(
  sql: TransactionSql,
  world: World,
  input: {
    clientId: string;
    kind: 'tutorial' | 'manual' | 'checklist';
    title: string;
    position: number;
    published?: boolean;
    url?: string | null;
    libraryFileId?: string | null;
    steps?: string[];
  },
): Promise<{ itemId: string; stepIds: string[] }> {
  const [item] = await sql<{ id: string }[]>`
    insert into public.academy_items (organization_id, client_id, kind, status, title, position,
                                      url, library_file_id, published_at)
    values (${world.organizationId}, ${input.clientId}, ${input.kind}::app.academy_item_kind,
            ${input.published ? 'published' : 'draft'}::app.academy_item_status, ${input.title},
            ${input.position}, ${input.url ?? null}, ${input.libraryFileId ?? null},
            ${input.published ? new Date().toISOString() : null})
    returning id
  `;
  if (!item) throw new Error('Academy item was not created');
  const stepIds: string[] = [];
  for (const [index, text] of (input.steps ?? []).entries()) {
    const [step] = await sql<{ id: string }[]>`
      insert into public.academy_checklist_steps (organization_id, client_id, item_id, position,
                                                  text)
      values (${world.organizationId}, ${input.clientId}, ${item.id}, ${index + 1}, ${text})
      returning id
    `;
    if (!step) throw new Error('Academy step was not created');
    stepIds.push(step.id);
  }
  return { itemId: item.id, stepIds };
}
