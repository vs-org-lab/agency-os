import type { BrandHubPageKind, BrandHubStandardKey } from '@agency-os/db';
import type { HubBlock } from './domain/blocks';
import type { HubDesign } from './domain/design';
import type { HubSnapshot } from './domain/snapshot';

export type HubApprovalState = 'none' | 'pending' | 'approved' | 'changes_requested';

export type HubEditorPage = {
  id: string;
  kind: BrandHubPageKind;
  standardKey: BrandHubStandardKey | null;
  title: string;
  hidden: boolean;
  blocks: HubBlock[];
};

export type HubEditorAsset = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  status: 'uploading' | 'ready' | 'rejected';
};

export type HubEditorView =
  | { hub: null; canCreate: boolean }
  | {
      hub: {
        id: string;
        design: HubDesign;
        pages: HubEditorPage[];
        assets: HubEditorAsset[];
        unpublishedChanges: boolean;
        lastPublishedAt: string | null;
        approval: HubApprovalState;
        canPublish: boolean;
        contrastWarning: boolean;
      };
    };

export type PortalHubView = {
  snapshot: HubSnapshot;
  publishedAt: string;
  clientName: string;
  approved: boolean;
  /** The pending approval the viewer may decide; only for the decision maker. */
  pendingApprovalId: string | null;
};
