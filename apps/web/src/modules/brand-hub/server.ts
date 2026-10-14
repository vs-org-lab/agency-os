import 'server-only';
import type { BrandHubBlockType } from '@agency-os/db';
import { createSupabaseLibraryStorage } from '@/modules/library/server';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import { domainProvider } from '@/platform/domain-provider';
import { brandHubSiteEnv } from '@/platform/env';
import type { BrandHubDeps } from './access';
import { decideHubApproval, requestHubApproval } from './approvals';
import { confirmHubAsset, removeHubAsset, requestHubAssetUpload } from './assets';
import { addHubBlock, moveHubBlock, removeHubBlock, updateHubBlock } from './blocks';
import {
  connectHubDomain,
  loadHubDomain,
  removeHubDomain,
  setHubDomain,
  verifyHubDomain,
} from './domains';
import { createBrandHub, updateHubDesign } from './hubs';
import { addHubPage, moveHubPage, removeHubPage, renameHubPage, setHubPageHidden } from './pages';
import {
  isSiteOrigin,
  publicHubManual,
  issueRestrictedToken,
  publicHubZip,
  readPublicHub,
  readPublicHubByDomain,
  unlockHub,
} from './public';
import { publishBrandHub } from './publish';
import { loadHubSharing, updateHubSharing } from './sharing';
import { hubAssetUrl, loadHubEditor, loadHubPreview, loadPortalHub } from './readers';
import { portalHubManual } from './manual';
import { hubZipManifest } from './zip';

const deps = (): BrandHubDeps => ({
  contexts: { withUserContext, withSystemContext },
  storage: createSupabaseLibraryStorage(),
  site: brandHubSiteEnv() ?? undefined,
  domains: domainProvider() ?? undefined,
});

type Direction = 'up' | 'down';

export const loadStaffBrandHub = (claims: VerifiedClaims, clientId: string) =>
  loadHubEditor(claims, clientId, deps());
export const previewBrandHub = (claims: VerifiedClaims, clientId: string) =>
  loadHubPreview(claims, clientId, deps());
export const loadPortalBrandHub = (claims: VerifiedClaims, clientId: string) =>
  loadPortalHub(claims, clientId, deps());

export const startBrandHub = (claims: VerifiedClaims, clientId: string) =>
  createBrandHub(claims, { clientId }, deps());
export const saveHubDesign = (claims: VerifiedClaims, hubId: string, design: unknown) =>
  updateHubDesign(claims, { hubId, design }, deps());

export const createHubPage = (claims: VerifiedClaims, hubId: string, title: string) =>
  addHubPage(claims, { hubId, title }, deps());
export const retitleHubPage = (claims: VerifiedClaims, pageId: string, title: string) =>
  renameHubPage(claims, { pageId, title }, deps());
export const toggleHubPage = (claims: VerifiedClaims, pageId: string, hidden: boolean) =>
  setHubPageHidden(claims, { pageId, hidden }, deps());
export const reorderHubPage = (claims: VerifiedClaims, pageId: string, direction: Direction) =>
  moveHubPage(claims, { pageId, direction }, deps());
export const deleteHubPage = (claims: VerifiedClaims, pageId: string) =>
  removeHubPage(claims, { pageId }, deps());

export const createHubBlock = (claims: VerifiedClaims, pageId: string, type: BrandHubBlockType) =>
  addHubBlock(claims, { pageId, type }, deps());
export const saveHubBlock = (claims: VerifiedClaims, blockId: string, content: unknown) =>
  updateHubBlock(claims, { blockId, content }, deps());
export const reorderHubBlock = (claims: VerifiedClaims, blockId: string, direction: Direction) =>
  moveHubBlock(claims, { blockId, direction }, deps());
export const deleteHubBlock = (claims: VerifiedClaims, blockId: string) =>
  removeHubBlock(claims, { blockId }, deps());

export const startHubAssetUpload = (
  claims: VerifiedClaims,
  hubId: string,
  file: { name: string; sizeBytes: number },
) => requestHubAssetUpload(claims, { hubId, ...file }, deps());
export const finishHubAssetUpload = (claims: VerifiedClaims, assetId: string) =>
  confirmHubAsset(claims, { assetId }, deps());
export const deleteHubAsset = (claims: VerifiedClaims, assetId: string) =>
  removeHubAsset(claims, { assetId }, deps());

export const publishHub = (claims: VerifiedClaims, hubId: string) =>
  publishBrandHub(claims, { hubId }, deps());
export const askHubApproval = (claims: VerifiedClaims, hubId: string) =>
  requestHubApproval(claims, { hubId }, deps());
export const decideBrandHubApproval = (
  claims: VerifiedClaims,
  input: { approvalId: string; decision: 'approved' | 'changes_requested'; comment: string },
) => decideHubApproval(claims, input, deps());

export const hubAssetLink = (claims: VerifiedClaims, assetId: string) =>
  hubAssetUrl(claims, assetId, deps());
export const brandHubZip = (claims: VerifiedClaims, clientId: string, pageId: string | null) =>
  hubZipManifest(claims, { clientId, pageId }, deps());

export const loadBrandHubSharing = (claims: VerifiedClaims, clientId: string) =>
  loadHubSharing(claims, clientId, deps());
export const saveHubSharing = (
  claims: VerifiedClaims,
  input: { hubId: string; slug: string; mode: string; password?: string },
) => updateHubSharing(claims, input, deps());

export const publicBrandHub = (slug: string, token: string | null) =>
  readPublicHub(slug, token, deps());
export const publicBrandHubByDomain = (host: string, token: string | null) =>
  readPublicHubByDomain(host, token, deps());
export const isBrandHubSiteOrigin = (origin: string) => isSiteOrigin(origin, deps());
export const publicBrandHubManual = (slug: string, token: string | null) =>
  publicHubManual(slug, token, deps());
export const brandHubManual = (claims: VerifiedClaims, clientId: string) =>
  portalHubManual(claims, clientId, deps());
export const publicBrandHubZip = (slug: string, token: string | null, pageId: string | null) =>
  publicHubZip(slug, token, pageId, deps());
export const unlockPublicBrandHub = (slug: string, password: string, ip: string) =>
  unlockHub(slug, password, ip, deps());
export const restrictedHubAccess = (claims: VerifiedClaims, slug: string, returnTo: string) =>
  issueRestrictedToken(claims, slug, returnTo, deps());

export { BRAND_HUB_FUNCTIONS } from './automations';

export const loadBrandHubDomain = (claims: VerifiedClaims, hubId: string) =>
  loadHubDomain(claims, hubId, deps());
export const saveHubDomain = (claims: VerifiedClaims, hubId: string, hostname: string) =>
  setHubDomain(claims, { hubId, hostname }, deps());
export const checkHubDomain = (claims: VerifiedClaims, hubId: string) =>
  verifyHubDomain(claims, hubId, deps());
export const linkHubDomain = (claims: VerifiedClaims, hubId: string) =>
  connectHubDomain(claims, hubId, deps());
export const unlinkHubDomain = (claims: VerifiedClaims, hubId: string) =>
  removeHubDomain(claims, hubId, deps());
