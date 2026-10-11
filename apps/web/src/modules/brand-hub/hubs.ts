import { eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { VerifiedClaims } from '@/platform/db';
import {
  changeDraft,
  editableHub,
  hubEditor,
  INVALID_INPUT,
  INVALID_STATE,
  NOT_FOUND,
  OK,
  type BrandHubDeps,
  type NotFound,
} from './access';
import { hubDesignSchema } from './domain/design';
import { STANDARD_PAGES, starterBlocks } from './domain/pages';

const { brandHubBlocks, brandHubPages, brandHubs } = schema;

/** Creates the client's hub with the nine standard pages and their starter blocks, once. */
export async function createBrandHub(
  claims: VerifiedClaims,
  input: { clientId: string },
  deps: BrandHubDeps,
): Promise<{ ok: true; hubId: string } | NotFound | typeof INVALID_STATE> {
  const editor = await hubEditor(claims, input.clientId, deps);
  if (!editor?.canPublish) return NOT_FOUND;
  const hubId = await deps.contexts.withSystemContext(async (tx) => {
    const [hub] = await tx
      .insert(brandHubs)
      .values({
        organizationId: editor.organizationId,
        clientId: editor.clientId,
        createdBy: editor.actorId,
      })
      .onConflictDoNothing({ target: brandHubs.clientId })
      .returning({ id: brandHubs.id });
    if (!hub) return null;
    for (const [index, page] of STANDARD_PAGES.entries()) {
      const [created] = await tx
        .insert(brandHubPages)
        .values({
          hubId: hub.id,
          organizationId: editor.organizationId,
          clientId: editor.clientId,
          kind: 'standard',
          standardKey: page.key,
          title: page.title,
          position: index + 1,
        })
        .returning({ id: brandHubPages.id });
      if (!created) throw new Error('Brand hub page was not created');
      await tx.insert(brandHubBlocks).values(
        starterBlocks(page.key).map((block, position) => ({
          pageId: created.id,
          hubId: hub.id,
          organizationId: editor.organizationId,
          clientId: editor.clientId,
          type: block.type,
          position: position + 1,
          content: block.content,
        })),
      );
    }
    await recordAudit(tx, {
      organizationId: editor.organizationId,
      action: 'brand_hub.created',
      resourceType: 'brand_hub',
      resourceId: hub.id,
      clientId: editor.clientId,
    });
    return hub.id;
  });
  return hubId ? { ok: true, hubId } : INVALID_STATE;
}

/** Sets the hub's colours, corners, logo tiles and layout (RF-091). */
export async function updateHubDesign(
  claims: VerifiedClaims,
  input: { hubId: string; design: unknown },
  deps: BrandHubDeps,
): Promise<typeof OK | NotFound | typeof INVALID_INPUT> {
  const access = await editableHub(claims, { kind: 'hub', id: input.hubId }, deps);
  if (!access) return NOT_FOUND;
  const design = hubDesignSchema.safeParse(input.design);
  if (!design.success) return INVALID_INPUT;
  return changeDraft(deps, access.hubId, async (tx) => {
    await tx.update(brandHubs).set({ design: design.data }).where(eq(brandHubs.id, access.hubId));
    return OK;
  });
}
