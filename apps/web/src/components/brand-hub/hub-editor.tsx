'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BrandHubBlockType } from '@agency-os/db';
import { Button } from '@agency-os/ui/components/button';
import { Label } from '@agency-os/ui/components/label';
import { cn } from '@agency-os/ui/lib/utils';
import { FormMessage } from '@/components/forms/form-message';
import { useRouter } from '@/i18n/navigation';
import type {
  HubDesign,
  HubDomainState,
  HubEditorView,
  HubSharingView,
  HubSnapshot,
} from '@/modules/brand-hub';
import { AssetsPanel, type AssetActions } from './assets-panel';
import { BlockEditor } from './block-editor';
import { DesignPanel } from './design-panel';
import { DomainPanel, type DomainActions } from './domain-panel';
import { hubError, type ActionResult, type HubError } from './hub-errors';
import { HubView } from './hub-view';
import { PageNavigator } from './page-navigator';
import { PublishBar } from './publish-bar';
import { SharingPanel, type SaveSharing } from './sharing-panel';

export type HubEditorActions = {
  addPage: (hubId: string, title: string) => Promise<ActionResult>;
  renamePage: (pageId: string, title: string) => Promise<ActionResult>;
  setPageHidden: (pageId: string, hidden: boolean) => Promise<ActionResult>;
  movePage: (pageId: string, direction: 'up' | 'down') => Promise<ActionResult>;
  removePage: (pageId: string) => Promise<ActionResult>;
  addBlock: (pageId: string, type: BrandHubBlockType) => Promise<ActionResult>;
  saveBlock: (blockId: string, content: unknown) => Promise<ActionResult>;
  moveBlock: (blockId: string, direction: 'up' | 'down') => Promise<ActionResult>;
  removeBlock: (blockId: string) => Promise<ActionResult>;
  saveDesign: (hubId: string, design: HubDesign) => Promise<ActionResult>;
  startAsset: AssetActions['start'];
  finishAsset: AssetActions['finish'];
  removeAsset: AssetActions['remove'];
  publish: (hubId: string) => Promise<ActionResult>;
  askApproval: (hubId: string) => Promise<ActionResult>;
  saveSharing: SaveSharing;
  domain?: DomainActions;
};

/** The same domain actions, refreshing the page after each one that succeeds. */
function refreshing(actions: DomainActions, refresh: () => void): DomainActions {
  const after =
    <A extends unknown[]>(run: (...args: A) => ReturnType<DomainActions['verify']>) =>
    async (...args: A) => {
      const outcome = await run(...args);
      if (outcome.ok) refresh();
      return outcome;
    };
  return {
    save: after(actions.save),
    verify: after(actions.verify),
    connect: after(actions.connect),
    remove: after(actions.remove),
  };
}

type EditorHub = Extract<HubEditorView, { hub: object }>['hub'];
type Panel = 'pages' | 'canvas' | 'side';

const BLOCK_TYPES: BrandHubBlockType[] = [
  'text',
  'strategy',
  'image',
  'gallery',
  'logo',
  'colors',
  'typeface',
  'downloads',
];

/**
 * C-08: pages on the left, the selected page's blocks in the middle, design and files on the right,
 * with Editar and Pré-visualizar; on small screens the three columns become tabs.
 */
export function HubEditor({
  hub,
  clientName,
  preview,
  sharing = null,
  domain = null,
  actions,
}: {
  hub: EditorHub;
  clientId: string;
  clientName: string;
  preview: HubSnapshot | null;
  sharing?: HubSharingView | null;
  domain?: HubDomainState | null;
  actions: HubEditorActions;
}) {
  const t = useTranslations('brandHub');
  const router = useRouter();
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [panel, setPanel] = useState<Panel>('canvas');
  const [selectedId, setSelectedId] = useState<string | null>(hub.pages[0]?.id ?? null);
  const [blockType, setBlockType] = useState<BrandHubBlockType>('text');
  const [error, setError] = useState<HubError | null>(null);
  const [pending, startTransition] = useTransition();
  const [sideTab, setSideTab] = useState<'design' | 'assets' | 'sharing'>('design');
  const sideTabs = [
    'design',
    'assets',
    ...(hub.canPublish && sharing ? (['sharing'] as const) : []),
  ] as const;
  const page = hub.pages.find((candidate) => candidate.id === selectedId) ?? hub.pages[0] ?? null;
  const refresh = () => router.refresh();

  const addBlock = () => {
    if (!page) return;
    startTransition(async () => {
      const outcome = await actions
        .addBlock(page.id, blockType)
        .catch(() => ({ ok: false, code: 'not_found' }) as const);
      setError(outcome.ok ? null : hubError(outcome.code));
      if (outcome.ok) refresh();
    });
  };

  const column = (name: Panel) => cn('flex-col gap-4', panel === name ? 'flex' : 'hidden lg:flex');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label={t('modes.label')}
          className="inline-flex rounded-md border border-border p-0.5"
        >
          {(['edit', 'preview'] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={mode === value ? 'secondary' : 'ghost'}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {t(`modes.${value}`)}
            </Button>
          ))}
        </div>
      </div>
      <PublishBar
        hubId={hub.id}
        unpublishedChanges={hub.unpublishedChanges}
        lastPublishedAt={hub.lastPublishedAt}
        approval={hub.approval}
        canPublish={hub.canPublish}
        publish={actions.publish}
        askApproval={actions.askApproval}
        onChanged={refresh}
      />
      {mode === 'preview' ? (
        preview ? (
          <HubView
            snapshot={preview}
            clientName={clientName}
            updatedAt={hub.lastPublishedAt}
            assetUrl={(assetId) => `/api/brand-hub/assets/${assetId}`}
            showEmpty
          />
        ) : null
      ) : (
        <>
          <div role="group" aria-label={t('panels.label')} className="flex gap-1 lg:hidden">
            {(['pages', 'canvas', 'side'] as const).map((name) => (
              <Button
                key={name}
                type="button"
                size="sm"
                variant={panel === name ? 'secondary' : 'ghost'}
                aria-pressed={panel === name}
                onClick={() => setPanel(name)}
              >
                {t(`panels.${name}`)}
              </Button>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
            <aside className={column('pages')}>
              <PageNavigator
                hubId={hub.id}
                pages={hub.pages}
                selectedId={page?.id ?? null}
                onSelect={(pageId) => {
                  setSelectedId(pageId);
                  setPanel('canvas');
                }}
                actions={{
                  add: actions.addPage,
                  rename: actions.renamePage,
                  setHidden: actions.setPageHidden,
                  move: actions.movePage,
                  remove: actions.removePage,
                }}
                onChanged={refresh}
              />
            </aside>
            <section aria-label={page?.title ?? t('panels.canvas')} className={column('canvas')}>
              {page ? (
                <>
                  <h2 className="text-title-sm text-text">{page.title}</h2>
                  {page.blocks.length === 0 ? (
                    <p className="text-body-sm text-text-secondary">{t('blocks.empty')}</p>
                  ) : (
                    page.blocks.map((block, index) => (
                      <BlockEditor
                        key={block.id}
                        block={block}
                        assets={hub.assets}
                        first={index === 0}
                        last={index === page.blocks.length - 1}
                        actions={{
                          save: actions.saveBlock,
                          move: actions.moveBlock,
                          remove: actions.removeBlock,
                        }}
                        onChanged={refresh}
                      />
                    ))
                  )}
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="hub-block-type">{t('blocks.type')}</Label>
                      <select
                        id="hub-block-type"
                        value={blockType}
                        onChange={(event) => setBlockType(event.target.value as BrandHubBlockType)}
                        className="h-9 rounded-md border border-border bg-surface px-2 text-body-sm text-text"
                      >
                        {BLOCK_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {t(`blocks.types.${type}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={addBlock}
                    >
                      <Plus aria-hidden="true" />
                      {t('blocks.add')}
                    </Button>
                  </div>
                  {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
                </>
              ) : null}
            </section>
            <aside className={column('side')}>
              <div role="group" aria-label={t('panels.side')} className="flex gap-1">
                {sideTabs.map((tab) => (
                  <Button
                    key={tab}
                    type="button"
                    size="sm"
                    variant={sideTab === tab ? 'secondary' : 'ghost'}
                    aria-pressed={sideTab === tab}
                    onClick={() => setSideTab(tab)}
                  >
                    {t(`${tab}.title`)}
                  </Button>
                ))}
              </div>
              {sideTab === 'sharing' && sharing ? (
                <div className="flex flex-col gap-8">
                  <SharingPanel
                    key={`${sharing.slug}-${sharing.mode}`}
                    sharing={sharing}
                    save={async (input) => {
                      const outcome = await actions.saveSharing(input);
                      if (outcome.ok) refresh();
                      return outcome;
                    }}
                  />
                  {domain && actions.domain ? (
                    <DomainPanel
                      key={`${domain.domain?.hostname ?? ''}-${domain.domain?.status ?? ''}`}
                      hubId={hub.id}
                      approved={domain.approved}
                      state={domain}
                      actions={refreshing(actions.domain, refresh)}
                    />
                  ) : null}
                </div>
              ) : sideTab === 'design' ? (
                <DesignPanel
                  key={hub.id}
                  hubId={hub.id}
                  design={hub.design}
                  save={async (hubId, design) => {
                    const outcome = await actions.saveDesign(hubId, design);
                    if (outcome.ok) refresh();
                    return outcome;
                  }}
                />
              ) : (
                <AssetsPanel
                  hubId={hub.id}
                  assets={hub.assets}
                  actions={{
                    start: actions.startAsset,
                    finish: actions.finishAsset,
                    remove: actions.removeAsset,
                  }}
                  onChanged={refresh}
                />
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
