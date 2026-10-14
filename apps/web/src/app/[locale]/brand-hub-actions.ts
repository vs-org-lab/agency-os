'use server';

import type { BrandHubBlockType } from '@agency-os/db';
import type { ActionResult } from '@/components/brand-hub/hub-errors';
import {
  askHubApproval,
  brandHubZip,
  createHubBlock,
  createHubPage,
  decideBrandHubApproval,
  deleteHubAsset,
  deleteHubBlock,
  deleteHubPage,
  finishHubAssetUpload,
  publishHub,
  reorderHubBlock,
  reorderHubPage,
  retitleHubPage,
  saveHubBlock,
  saveHubDesign,
  saveHubSharing,
  startBrandHub,
  startHubAssetUpload,
  toggleHubPage,
} from '@/modules/brand-hub/server';
import type { ZipManifest } from '@/modules/library';
import { getVerifiedClaims } from '@/platform/session';

const NOT_FOUND = { ok: false, code: 'not_found' } as const;

type Direction = 'up' | 'down';

function outcome(result: { ok: true } | { ok: false; rule: string }): ActionResult {
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

async function withClaims(
  run: (
    claims: NonNullable<Awaited<ReturnType<typeof getVerifiedClaims>>>,
  ) => Promise<{ ok: true } | { ok: false; rule: string }>,
): Promise<ActionResult> {
  const claims = await getVerifiedClaims();
  return claims ? outcome(await run(claims)) : NOT_FOUND;
}

export async function createBrandHubAction(clientId: string): Promise<ActionResult> {
  return withClaims((claims) => startBrandHub(claims, clientId));
}

export async function saveHubDesignAction(hubId: string, design: unknown): Promise<ActionResult> {
  return withClaims((claims) => saveHubDesign(claims, hubId, design));
}

export async function addHubPageAction(hubId: string, title: string): Promise<ActionResult> {
  return withClaims((claims) => createHubPage(claims, hubId, title));
}

export async function renameHubPageAction(pageId: string, title: string): Promise<ActionResult> {
  return withClaims((claims) => retitleHubPage(claims, pageId, title));
}

export async function setHubPageHiddenAction(
  pageId: string,
  hidden: boolean,
): Promise<ActionResult> {
  return withClaims((claims) => toggleHubPage(claims, pageId, hidden));
}

export async function moveHubPageAction(
  pageId: string,
  direction: Direction,
): Promise<ActionResult> {
  return withClaims((claims) => reorderHubPage(claims, pageId, direction));
}

export async function removeHubPageAction(pageId: string): Promise<ActionResult> {
  return withClaims((claims) => deleteHubPage(claims, pageId));
}

export async function addHubBlockAction(
  pageId: string,
  type: BrandHubBlockType,
): Promise<ActionResult> {
  return withClaims((claims) => createHubBlock(claims, pageId, type));
}

export async function saveHubBlockAction(blockId: string, content: unknown): Promise<ActionResult> {
  return withClaims((claims) => saveHubBlock(claims, blockId, content));
}

export async function moveHubBlockAction(
  blockId: string,
  direction: Direction,
): Promise<ActionResult> {
  return withClaims((claims) => reorderHubBlock(claims, blockId, direction));
}

export async function removeHubBlockAction(blockId: string): Promise<ActionResult> {
  return withClaims((claims) => deleteHubBlock(claims, blockId));
}

export async function startHubAssetAction(
  hubId: string,
  file: { name: string; sizeBytes: number },
): Promise<{ ok: true; assetId: string; uploadUrl: string } | { ok: false; code: string }> {
  const claims = await getVerifiedClaims();
  if (!claims) return NOT_FOUND;
  const result = await startHubAssetUpload(claims, hubId, file);
  return result.ok
    ? { ok: true, assetId: result.assetId, uploadUrl: result.uploadUrl }
    : { ok: false, code: result.rule };
}

export async function finishHubAssetAction(assetId: string): Promise<ActionResult> {
  return withClaims((claims) => finishHubAssetUpload(claims, assetId));
}

export async function removeHubAssetAction(assetId: string): Promise<ActionResult> {
  return withClaims((claims) => deleteHubAsset(claims, assetId));
}

export async function publishHubAction(hubId: string): Promise<ActionResult> {
  return withClaims((claims) => publishHub(claims, hubId));
}

export async function askHubApprovalAction(hubId: string): Promise<ActionResult> {
  return withClaims((claims) => askHubApproval(claims, hubId));
}

export async function decideHubApprovalAction(input: {
  approvalId: string;
  decision: 'approved' | 'changes_requested';
  comment: string;
}): Promise<ActionResult> {
  return withClaims((claims) => decideBrandHubApproval(claims, input));
}

export async function hubZipAction(
  clientId: string,
  pageId: string | null,
): Promise<ZipManifest | { ok: false; code: string }> {
  const claims = await getVerifiedClaims();
  if (!claims) return NOT_FOUND;
  const result = await brandHubZip(claims, clientId, pageId);
  return result.ok ? result : { ok: false, code: result.rule };
}

export async function saveHubSharingAction(input: {
  hubId: string;
  slug: string;
  mode: string;
  password: string;
}): Promise<ActionResult> {
  return withClaims((claims) =>
    saveHubSharing(claims, { ...input, password: input.password || undefined }),
  );
}
