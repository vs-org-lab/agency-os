'use client';

import { pageAssetIds, type PortalHubView } from '@/modules/brand-hub';
import {
  HubDownloads,
  HubManualDownload,
  type RequestHubManual,
  type RequestHubZip,
} from './hub-downloads';
import { HubView } from './hub-view';

/**
 * P-08: the publication with a download per page that has files, every asset at once and the full
 * brand manual.
 */
export function PortalHub({
  hub,
  requestZip,
  requestManual,
}: {
  hub: PortalHubView;
  requestZip: RequestHubZip;
  requestManual: RequestHubManual;
}) {
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
      footer={
        <div className="flex flex-wrap gap-2">
          {hasAssets ? <HubDownloads pageId={null} label="" requestZip={requestZip} /> : null}
          <HubManualDownload requestManual={requestManual} />
        </div>
      }
    />
  );
}
