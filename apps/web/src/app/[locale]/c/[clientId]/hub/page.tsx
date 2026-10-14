import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { CreateHub } from '@/components/brand-hub/create-hub';
import { HubEditor } from '@/components/brand-hub/hub-editor';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import {
  loadBrandHubDomain,
  loadBrandHubSharing,
  loadStaffBrandHub,
  previewBrandHub,
} from '@/modules/brand-hub/server';
import { findVisibleClient } from '@/modules/organizations';
import { withUserContext } from '@/platform/db';
import {
  addHubBlockAction,
  addHubPageAction,
  askHubApprovalAction,
  connectHubDomainAction,
  createBrandHubAction,
  finishHubAssetAction,
  moveHubBlockAction,
  moveHubPageAction,
  publishHubAction,
  removeHubAssetAction,
  removeHubBlockAction,
  removeHubDomainAction,
  removeHubPageAction,
  renameHubPageAction,
  saveHubBlockAction,
  saveHubDesignAction,
  saveHubSharingAction,
  setHubDomainAction,
  setHubPageHiddenAction,
  startHubAssetAction,
  verifyHubDomainAction,
} from '../../../brand-hub-actions';
import { RoomHeader } from '../room/room-header';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; clientId: string }> };

/** C-08: the client's brand hub editor. */
export default async function RoomBrandHubPage({ params }: PageProps) {
  const { locale: requested, clientId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const client = await withUserContext(session.claims, (tx) => findVisibleClient(tx, clientId));
  if (!client) notFound();
  const [view, preview, sharing] = await Promise.all([
    loadStaffBrandHub(session.claims, clientId),
    previewBrandHub(session.claims, clientId),
    loadBrandHubSharing(session.claims, clientId),
  ]);
  const domainState = sharing ? await loadBrandHubDomain(session.claims, sharing.hubId) : null;
  const domain = domainState && 'available' in domainState ? domainState : null;
  const t = await getTranslations('brandHub');

  return (
    <div className="flex w-full flex-col gap-6">
      <RoomHeader
        clientId={clientId}
        clientName={client.name}
        projects={[]}
        selectedId={null}
        basePath={`/c/${clientId}/hub`}
      />
      <h2 className="text-title-sm text-text">{t('title')}</h2>
      {!view ? (
        <EmptyState title={t('title')} description={t('empty.noAccess')} />
      ) : !view.hub ? (
        <div className="flex flex-col gap-4">
          <EmptyState title={t('empty.title')} description={t('empty.description')} />
          {view.canCreate ? <CreateHub clientId={clientId} create={createBrandHubAction} /> : null}
        </div>
      ) : (
        <HubEditor
          hub={view.hub}
          clientId={clientId}
          clientName={client.name}
          preview={preview}
          sharing={sharing}
          domain={domain}
          actions={{
            addPage: addHubPageAction,
            renamePage: renameHubPageAction,
            setPageHidden: setHubPageHiddenAction,
            movePage: moveHubPageAction,
            removePage: removeHubPageAction,
            addBlock: addHubBlockAction,
            saveBlock: saveHubBlockAction,
            moveBlock: moveHubBlockAction,
            removeBlock: removeHubBlockAction,
            saveDesign: saveHubDesignAction,
            startAsset: startHubAssetAction,
            finishAsset: finishHubAssetAction,
            removeAsset: removeHubAssetAction,
            publish: publishHubAction,
            askApproval: askHubApprovalAction,
            saveSharing: saveHubSharingAction,
            domain: {
              save: setHubDomainAction,
              verify: verifyHubDomainAction,
              connect: connectHubDomainAction,
              remove: removeHubDomainAction,
            },
          }}
        />
      )}
    </div>
  );
}
