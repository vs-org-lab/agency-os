'use client';

import { useId, useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BrandHubBlockType } from '@agency-os/db';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import type { BlockContentMap, HubBlock, HubEditorAsset } from '@/modules/brand-hub';
import { hubError, type ActionResult, type HubError } from './hub-errors';

export type BlockActions = {
  save: (blockId: string, content: unknown) => Promise<ActionResult>;
  move: (blockId: string, direction: 'up' | 'down') => Promise<ActionResult>;
  remove: (blockId: string) => Promise<ActionResult>;
};

const STRATEGY_FIELDS = ['story', 'mission', 'vision', 'values', 'voice', 'positioning'] as const;

function Field({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  );
}

function AssetSelect({
  label,
  value,
  assets,
  onChange,
}: {
  label: string;
  value: string | null;
  assets: HubEditorAsset[];
  onChange: (assetId: string | null) => void;
}) {
  const t = useTranslations('brandHub.blocks.fields');
  return (
    <Field label={label}>
      {(id) => (
        <select
          id={id}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
          className="h-9 rounded-md border border-border bg-surface px-2 text-body-sm text-text"
        >
          <option value="">{t('noAsset')}</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

function AssetChecklist({
  legend,
  assets,
  selected,
  onChange,
}: {
  legend: string;
  assets: HubEditorAsset[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-body-sm font-medium text-text">{legend}</legend>
      {assets.map((asset) => (
        <label key={asset.id} className="flex items-center gap-2 text-body-sm text-text">
          <input
            type="checkbox"
            checked={selected.includes(asset.id)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, asset.id]
                  : selected.filter((id) => id !== asset.id),
              )
            }
          />
          {asset.name}
        </label>
      ))}
    </fieldset>
  );
}

function ContentFields({
  block,
  content,
  setContent,
  assets,
}: {
  block: HubBlock;
  content: unknown;
  setContent: (content: unknown) => void;
  assets: HubEditorAsset[];
}) {
  const t = useTranslations('brandHub.blocks');
  const images = assets.filter((asset) => asset.mimeType.startsWith('image/'));
  const fonts = assets.filter((asset) => asset.mimeType.startsWith('font/'));

  switch (block.type) {
    case 'text': {
      const value = content as BlockContentMap['text'];
      return (
        <>
          <Field label={t('fields.title')}>
            {(id) => (
              <Input
                id={id}
                value={value.title}
                maxLength={120}
                onChange={(event) => setContent({ ...value, title: event.target.value })}
              />
            )}
          </Field>
          <Field label={t('fields.body')}>
            {(id) => (
              <Textarea
                id={id}
                value={value.body}
                maxLength={5000}
                rows={5}
                onChange={(event) => setContent({ ...value, body: event.target.value })}
              />
            )}
          </Field>
        </>
      );
    }
    case 'strategy': {
      const value = content as BlockContentMap['strategy'];
      return (
        <>
          {STRATEGY_FIELDS.map((field) => (
            <Field key={field} label={t(`strategy.${field}`)}>
              {(id) => (
                <Textarea
                  id={id}
                  value={value[field]}
                  maxLength={2000}
                  rows={3}
                  onChange={(event) => setContent({ ...value, [field]: event.target.value })}
                />
              )}
            </Field>
          ))}
        </>
      );
    }
    case 'image': {
      const value = content as BlockContentMap['image'];
      return (
        <>
          <AssetSelect
            label={t('fields.asset')}
            value={value.assetId}
            assets={images}
            onChange={(assetId) => setContent({ ...value, assetId })}
          />
          <Field label={t('fields.caption')}>
            {(id) => (
              <Input
                id={id}
                value={value.caption}
                maxLength={200}
                onChange={(event) => setContent({ ...value, caption: event.target.value })}
              />
            )}
          </Field>
        </>
      );
    }
    case 'gallery': {
      const value = content as BlockContentMap['gallery'];
      return (
        <AssetChecklist
          legend={t('fields.images')}
          assets={images}
          selected={value.items.map((item) => item.assetId)}
          onChange={(ids) =>
            setContent({
              items: ids.slice(0, 24).map((assetId) => ({
                assetId,
                caption: value.items.find((item) => item.assetId === assetId)?.caption ?? '',
              })),
            })
          }
        />
      );
    }
    case 'logo': {
      const value = content as BlockContentMap['logo'];
      return (
        <>
          <AssetSelect
            label={t('fields.asset')}
            value={value.assetId}
            assets={assets}
            onChange={(assetId) => setContent({ ...value, assetId })}
          />
          <Field label={t('fields.variant')}>
            {(id) => (
              <Input
                id={id}
                value={value.variant}
                maxLength={80}
                onChange={(event) => setContent({ ...value, variant: event.target.value })}
              />
            )}
          </Field>
          <Field label={t('fields.background')}>
            {(id) => (
              <select
                id={id}
                value={value.background}
                onChange={(event) =>
                  setContent({
                    ...value,
                    background: event.target.value as BlockContentMap['logo']['background'],
                  })
                }
                className="h-9 rounded-md border border-border bg-surface px-2 text-body-sm text-text"
              >
                {(['light', 'dark', 'accent'] as const).map((background) => (
                  <option key={background} value={background}>
                    {t(`backgrounds.${background}`)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </>
      );
    }
    case 'colors': {
      const value = content as BlockContentMap['colors'];
      const update = (
        index: number,
        patch: Partial<BlockContentMap['colors']['swatches'][number]>,
      ) =>
        setContent({
          swatches: value.swatches.map((swatch, at) =>
            at === index ? { ...swatch, ...patch } : swatch,
          ),
        });
      return (
        <div className="flex flex-col gap-3">
          {value.swatches.map((swatch, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_7rem_1fr_auto] sm:items-end">
              <Field label={t('fields.swatchName')}>
                {(id) => (
                  <Input
                    id={id}
                    value={swatch.name}
                    maxLength={40}
                    onChange={(event) => update(index, { name: event.target.value })}
                  />
                )}
              </Field>
              <Field label={t('fields.hex')}>
                {(id) => (
                  <Input
                    id={id}
                    value={swatch.hex}
                    maxLength={7}
                    className="font-mono"
                    onChange={(event) => update(index, { hex: event.target.value })}
                  />
                )}
              </Field>
              <Field label={t('fields.notes')}>
                {(id) => (
                  <Input
                    id={id}
                    value={swatch.notes}
                    maxLength={80}
                    onChange={(event) => update(index, { notes: event.target.value })}
                  />
                )}
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('fields.removeSwatch', { name: swatch.name || swatch.hex })}
                onClick={() =>
                  setContent({ swatches: value.swatches.filter((_, at) => at !== index) })
                }
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          ))}
          {value.swatches.length < 24 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                setContent({
                  swatches: [...value.swatches, { name: '', hex: '#000000', notes: '' }],
                })
              }
            >
              <Plus aria-hidden="true" />
              {t('fields.addSwatch')}
            </Button>
          ) : null}
        </div>
      );
    }
    case 'typeface': {
      const value = content as BlockContentMap['typeface'];
      return (
        <>
          <Field label={t('fields.family')}>
            {(id) => (
              <Input
                id={id}
                value={value.family}
                maxLength={80}
                onChange={(event) => setContent({ ...value, family: event.target.value })}
              />
            )}
          </Field>
          <Field label={t('fields.weights')}>
            {(id) => (
              <Input
                id={id}
                value={value.weights.join(', ')}
                onChange={(event) =>
                  setContent({
                    ...value,
                    weights: event.target.value
                      .split(',')
                      .map((weight) => weight.trim())
                      .filter(Boolean)
                      .slice(0, 10),
                  })
                }
              />
            )}
          </Field>
          <Field label={t('fields.sample')}>
            {(id) => (
              <Input
                id={id}
                value={value.sample}
                maxLength={200}
                onChange={(event) => setContent({ ...value, sample: event.target.value })}
              />
            )}
          </Field>
          <AssetSelect
            label={t('fields.fontFile')}
            value={value.assetId}
            assets={fonts}
            onChange={(assetId) => setContent({ ...value, assetId })}
          />
        </>
      );
    }
    case 'downloads': {
      const value = content as BlockContentMap['downloads'];
      return (
        <AssetChecklist
          legend={t('fields.files')}
          assets={assets}
          selected={value.items.map((item) => item.assetId)}
          onChange={(ids) =>
            setContent({
              items: ids.slice(0, 50).map((assetId) => ({
                assetId,
                label:
                  value.items.find((item) => item.assetId === assetId)?.label ??
                  assets.find((asset) => asset.id === assetId)?.name.slice(0, 80) ??
                  assetId,
              })),
            })
          }
        />
      );
    }
    default:
      return null;
  }
}

/** One block of the canvas: its form, saved on demand, and its order and removal controls. */
export function BlockEditor({
  block,
  assets,
  first,
  last,
  actions,
  onChanged,
}: {
  block: HubBlock;
  assets: HubEditorAsset[];
  first: boolean;
  last: boolean;
  actions: BlockActions;
  onChanged: () => void;
}) {
  const t = useTranslations('brandHub');
  const [content, setContent] = useState<unknown>(block.content);
  const [stored, setStored] = useState(block.content);
  if (stored !== block.content && JSON.stringify(stored) !== JSON.stringify(block.content)) {
    setStored(block.content);
    setContent(block.content);
  }
  const [result, setResult] = useState<'saved' | HubError | null>(null);
  const [pending, startTransition] = useTransition();
  const ready = assets.filter((asset) => asset.status === 'ready');

  const run = (action: () => Promise<ActionResult>, saved = false) =>
    startTransition(async () => {
      const outcome = await action().catch(() => ({ ok: false, code: 'not_found' }) as const);
      setResult(outcome.ok ? (saved ? 'saved' : null) : hubError(outcome.code));
      if (outcome.ok) onChanged();
    });

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-body-sm font-medium text-text">
          {t(`blocks.types.${block.type as BrandHubBlockType}`)}
        </h3>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('blocks.up')}
            disabled={pending || first}
            onClick={() => run(() => actions.move(block.id, 'up'))}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('blocks.down')}
            disabled={pending || last}
            onClick={() => run(() => actions.move(block.id, 'down'))}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('blocks.remove')}
            disabled={pending}
            onClick={() => run(() => actions.remove(block.id))}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </header>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => actions.save(block.id, content), true);
        }}
      >
        <ContentFields block={block} content={content} setContent={setContent} assets={ready} />
        <Button type="submit" size="sm" disabled={pending} className="self-start">
          {t('blocks.save')}
        </Button>
      </form>
      {result === 'saved' ? (
        <FormMessage tone="success">{t('blocks.saved')}</FormMessage>
      ) : result ? (
        <FormMessage tone="danger">{t(`errors.${result}`)}</FormMessage>
      ) : null}
    </article>
  );
}
