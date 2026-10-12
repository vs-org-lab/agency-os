'use client';

import { pageAssetIds, type PortalHubView } from '@/modules/brand-hub';
import { HubDownloads, type RequestHubZip } from './hub-downloads';
import { HubView } from './hub-view';

/** P-08: the publication with a download per page that has files, and every asset at once. */
export function PortalHub({ hub, requestZip }: { hub: PortalHubView; requestZip: RequestHubZip }) {
  const hasAssets = hub.snapshot.assets.length > 0;
  return (
    <HubView
      snapshot={hub.snapshot}
      clientName={hub.clientName}
      updatedAt={hub.publishedAt}
      assetUrl={(assetId) => `/api/brand-hub/assets/${assetId}`}
      pageAction={(page) =>
        pageAssetIds(page.blocks).length > 0 ? (
          <HubDownloads pageId={page.id} label={page.title} requestZip={requestZip} />
        ) : null
      }
      footer={hasAssets ? <HubDownloads pageId={null} label="" requestZip={requestZip} /> : null}
    />
  );
}
