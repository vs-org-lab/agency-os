import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { detectLibraryType } from '@/modules/library';
import type { VerifiedClaims } from '@/platform/db';
import type { ReceiptImageType, ReceiptProposal } from '@/platform/receipt-reader';
import {
  INVALID_FILE,
  INVALID_INPUT,
  moneyActor,
  NOT_FOUND,
  type MoneyDeps,
  type NotFound,
} from './access';

export const MAX_RECEIPT_BYTES = 10_485_760;

const IMAGE_TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/webp']);
const RECEIPT_TYPES = new Set<string>([...IMAGE_TYPES, 'application/pdf']);

export const receiptIdSchema = z.uuid();

/** Receipts are kept per organisation, uploaded before the expense that will hold them exists. */
export function receiptPath(organizationId: string, receiptId: string): string {
  return ['money', organizationId, 'receipts', receiptId].join('/');
}

/**
 * The receipt's real type when it is a JPEG, PNG, WebP or PDF within the size limit; anything else
 * is removed from storage.
 */
export async function verifiedReceipt(
  path: string,
  deps: MoneyDeps,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const bytes = await deps.storage.download(path);
  if (!bytes) return null;
  const detected = bytes.length <= MAX_RECEIPT_BYTES ? detectLibraryType(bytes, 'receipt') : null;
  if (!detected || !RECEIPT_TYPES.has(detected.mimeType)) {
    await deps.storage.remove(path);
    return null;
  }
  return { bytes, mimeType: detected.mimeType };
}

/** A signed link to upload a receipt, for whoever writes money. */
export async function startReceiptUpload(
  claims: VerifiedClaims,
  input: { fileName: string; sizeBytes: number },
  deps: MoneyDeps,
): Promise<{ ok: true; receiptId: string; uploadUrl: string } | NotFound | typeof INVALID_INPUT> {
  const actor = await moneyActor(claims, 'write', deps);
  if (!actor) return NOT_FOUND;
  const name = input.fileName.trim();
  if (!name || name.length > 200 || !Number.isInteger(input.sizeBytes)) return INVALID_INPUT;
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_RECEIPT_BYTES) return INVALID_INPUT;
  const receiptId = randomUUID();
  const uploadUrl = await deps.storage.createUploadUrl(
    receiptPath(actor.organizationId, receiptId),
  );
  return { ok: true, receiptId, uploadUrl };
}

/**
 * Checks an uploaded receipt and, for an image, asks the reader for a proposal (RF-152). Nothing is
 * saved: the person confirms the fields when saving the expense.
 */
export async function readReceipt(
  claims: VerifiedClaims,
  receiptId: string,
  deps: MoneyDeps,
): Promise<
  { ok: true; mimeType: string; proposal: ReceiptProposal | null } | NotFound | typeof INVALID_FILE
> {
  const actor = await moneyActor(claims, 'write', deps);
  if (!actor || !receiptIdSchema.safeParse(receiptId).success) return NOT_FOUND;
  const receipt = await verifiedReceipt(receiptPath(actor.organizationId, receiptId), deps);
  if (!receipt) return INVALID_FILE;
  const proposal =
    deps.reader && IMAGE_TYPES.has(receipt.mimeType)
      ? await deps.reader.read(receipt.bytes, receipt.mimeType as ReceiptImageType)
      : null;
  return { ok: true, mimeType: receipt.mimeType, proposal };
}
