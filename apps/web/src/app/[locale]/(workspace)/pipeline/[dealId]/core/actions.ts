'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { requireLocale } from '@/i18n/require-locale';
import type { CoreLevel, FindingOwner, OrbitFront, RoadmapLane } from '@agency-os/db';
import { commercialSession } from '@/modules/commercial/server';
import {
  applyCoreBriefingDraft,
  grantCorePortalAccess,
  coreEvidenceUrl,
  recordCoreCrossReview,
  removeCoreFinding,
  saveCoreDetails,
  saveCoreFinding,
  saveCoreNote,
  saveCoreScores,
  saveCoreTranscript,
  shareCoreBriefing,
  type FindingEvidenceInput,
} from '@/modules/diagnosis/server';
import {
  removeCoreDocument,
  saveCoreDocument,
  shareCoreDocument,
  withdrawCoreDocument,
} from '@/modules/documents/server';
import { getVerifiedClaims } from '@/platform/session';
import type { FindingFormState } from './finding-form';

export type CoreFormState =
  | { status: 'idle' | 'saved' }
  | { status: 'error'; code: string }
  | { status: 'warning'; code: string };

export type CoreActionResult = { ok: true } | { ok: false; code: string };

const NOT_FOUND = { status: 'error', code: 'not_found' } as const;

async function session() {
  return commercialSession(await getVerifiedClaims());
}

function refresh(dealId: string) {
  revalidatePath(`/pipeline/${dealId}`);
  revalidatePath(`/pipeline/${dealId}/core/call`);
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export async function saveNoteAction(
  engagementId: string,
  blockId: string,
  questionId: string | null,
  body: string,
): Promise<boolean> {
  const current = await session();
  if (!current) return false;
  const result = await saveCoreNote(current, { engagementId, blockId, questionId, body });
  return result.ok;
}

export async function saveTranscriptAction(
  engagementId: string,
  dealId: string,
  _state: CoreFormState,
  formData: FormData,
): Promise<CoreFormState> {
  const current = await session();
  if (!current) return NOT_FOUND;
  const transcript = formData.get('transcript');
  const result = await saveCoreTranscript(current, {
    engagementId,
    transcript: typeof transcript === 'string' ? transcript : '',
  });
  if (!result.ok) return { status: 'error', code: result.rule };
  refresh(dealId);
  return { status: 'saved' };
}

export async function shareBriefingAction(
  engagementId: string,
  dealId: string,
): Promise<CoreActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  const result = await shareCoreBriefing(current, { engagementId });
  if (!result.ok) return { ok: false, code: result.rule };
  refresh(dealId);
  return { ok: true };
}

export async function saveBuyerTestAction(
  engagementId: string,
  dealId: string,
  _state: CoreFormState,
  formData: FormData,
): Promise<CoreFormState> {
  const current = await session();
  if (!current) return NOT_FOUND;
  const result = await saveCoreDetails(current, {
    engagementId,
    buyerTestUrl: text(formData, 'buyerTestUrl') || null,
  });
  if (!result.ok) return { status: 'error', code: result.rule };
  refresh(dealId);
  return { status: 'saved' };
}

export async function saveFindingAction(
  engagementId: string,
  dealId: string,
  _state: FindingFormState,
  formData: FormData,
): Promise<FindingFormState> {
  const current = await session();
  if (!current) return NOT_FOUND;
  const kind = text(formData, 'evidenceKind');
  const note = text(formData, 'evidenceNote') || undefined;
  const file = formData.get('evidenceFile');
  const findingId = text(formData, 'findingId') || undefined;

  let evidence: FindingEvidenceInput | null = null;
  let keepEvidence = false;
  if (kind === 'file') {
    if (file instanceof File && file.size > 0) {
      evidence = { kind: 'file', bytes: new Uint8Array(await file.arrayBuffer()), note };
    } else if (findingId) {
      keepEvidence = true;
    } else {
      return { status: 'error', code: 'invalid_input' };
    }
  } else if (kind === 'link' || kind === 'number' || kind === 'page') {
    evidence = { kind, value: text(formData, 'evidenceValue'), note };
  }

  const result = await saveCoreFinding(current, {
    engagementId,
    findingId,
    front: text(formData, 'front') as OrbitFront,
    title: text(formData, 'title'),
    description: text(formData, 'description'),
    evidence,
    keepEvidence,
    impact: text(formData, 'impact') as CoreLevel,
    effort: text(formData, 'effort') as CoreLevel,
    lane: (text(formData, 'lane') || undefined) as RoadmapLane | undefined,
    owner: text(formData, 'owner') as FindingOwner,
    bringToCall: formData.get('bringToCall') === 'on',
  });
  if (!result.ok) return { status: 'error', code: result.rule };
  refresh(dealId);
  return { status: 'saved' };
}

export async function removeFindingAction(
  findingId: string,
  dealId: string,
): Promise<CoreActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  const result = await removeCoreFinding(current, { findingId });
  if (!result.ok) return { ok: false, code: result.rule };
  refresh(dealId);
  return { ok: true };
}

export async function evidenceUrlAction(findingId: string): Promise<string | null> {
  const current = await session();
  if (!current) return null;
  return coreEvidenceUrl(current, { findingId });
}

export async function saveScoresAction(
  engagementId: string,
  dealId: string,
  front: OrbitFront,
  criterionIds: string[],
  _state: CoreFormState,
  formData: FormData,
): Promise<CoreFormState> {
  const current = await session();
  if (!current) return NOT_FOUND;
  const scores = criterionIds.map((criterionId) => ({
    front,
    criterionId,
    points: Number(text(formData, `points-${criterionId}`)),
    justification: text(formData, `justification-${criterionId}`),
  }));
  if (scores.some((score) => !Number.isInteger(score.points))) {
    return { status: 'error', code: 'invalid_input' };
  }
  const result = await saveCoreScores(current, { engagementId, scores });
  if (!result.ok) return { status: 'error', code: result.rule };
  refresh(dealId);
  return { status: 'saved' };
}

export async function crossReviewAction(
  engagementId: string,
  dealId: string,
  _state: CoreFormState,
  formData: FormData,
): Promise<CoreFormState> {
  const current = await session();
  if (!current) return NOT_FOUND;
  const result = await recordCoreCrossReview(current, {
    engagementId,
    notes: text(formData, 'notes'),
  });
  if (!result.ok) return { status: 'error', code: result.rule };
  refresh(dealId);
  return result.sameAuthorWarning ? { status: 'warning', code: 'sameAuthor' } : { status: 'saved' };
}

export type ApplyDraftState =
  | { ok: true }
  | { ok: false; code: 'confirm_overwrite'; blockIds: string[] }
  | { ok: false; code: string };

export async function applyDraftAction(
  engagementId: string,
  dealId: string,
  draft: string,
  overwrite: boolean,
): Promise<ApplyDraftState> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  const result = await applyCoreBriefingDraft(current, { engagementId, text: draft, overwrite });
  if (!result.ok) {
    return result.rule === 'confirm_overwrite'
      ? { ok: false, code: 'confirm_overwrite', blockIds: result.blockIds }
      : { ok: false, code: result.rule };
  }
  refresh(dealId);
  return { ok: true };
}

export async function saveNarrativeAction(
  engagementId: string,
  dealId: string,
  narrative: string,
): Promise<CoreActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  const result = await saveCoreDetails(current, { engagementId, narrative });
  if (!result.ok) return { ok: false, code: result.rule };
  refresh(dealId);
  return { ok: true };
}

export async function saveDocumentAction(
  dealId: string,
  documentId: string | null,
  _state: CoreFormState,
  formData: FormData,
): Promise<CoreFormState> {
  const current = await session();
  if (!current) return NOT_FOUND;
  const result = await saveCoreDocument(current, {
    documentId: documentId ?? undefined,
    dealId,
    title: text(formData, 'title'),
    url: text(formData, 'url'),
  });
  if (!result.ok) return { status: 'error', code: result.rule };
  refresh(dealId);
  return { status: 'saved' };
}

export async function changeDocumentAction(
  dealId: string,
  documentId: string,
  change: 'share' | 'withdraw' | 'remove',
): Promise<CoreActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  const run = {
    share: shareCoreDocument,
    withdraw: withdrawCoreDocument,
    remove: removeCoreDocument,
  };
  const result = await run[change](current, documentId);
  if (!result.ok) return { ok: false, code: result.rule };
  refresh(dealId);
  revalidatePath(`/pipeline/${dealId}/documents/${documentId}`);
  return { ok: true };
}

export async function grantPortalAccessAction(dealId: string): Promise<CoreActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  const result = await grantCorePortalAccess(current, dealId, requireLocale(await getLocale()));
  if (!result.ok) return { ok: false, code: result.rule };
  refresh(dealId);
  return { ok: true };
}
