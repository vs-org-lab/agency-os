import type { CSSProperties, ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { cn } from '@agency-os/ui/lib/utils';
import { ColorSwatch } from './color-swatch';
import type { HubBlock } from './domain/blocks';
import type { HubSnapshot, HubSnapshotPage } from './domain/snapshot';

type AssetUrl = (assetId: string) => string;

const STRATEGY_FIELDS = ['story', 'mission', 'vision', 'values', 'voice', 'positioning'] as const;

/** Keeps only the characters a typeface name uses, so a published value cannot escape the declaration. */
function cssFamily(family: string): string {
  return family.replace(/[^\p{L}\p{N} ._-]/gu, '');
}

function hubStyle(snapshot: HubSnapshot): CSSProperties {
  const { colors, corners } = snapshot.design;
  return {
    '--hub-surface': colors.surface,
    '--hub-panel': colors.panel,
    '--hub-text': colors.text,
    '--hub-text-muted': colors.textMuted,
    '--hub-accent': colors.accent,
    '--hub-divider': colors.divider,
    '--hub-radius': corners === 'soft' ? '0.75rem' : '0',
  } as CSSProperties;
}

function Paragraphs({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, index) => (
          <p
            key={index}
            className={cn(
              'max-w-[62ch] whitespace-pre-line text-[17px] leading-[1.65] text-[var(--hub-text)]',
              className,
            )}
          >
            {paragraph}
          </p>
        ))}
    </>
  );
}

function Tile({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--hub-radius)] border border-[var(--hub-divider)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

const TILE_BACKGROUND = {
  light: 'bg-[var(--hub-surface)]',
  dark: 'bg-[var(--hub-text)]',
  accent: 'bg-[var(--hub-accent)]',
} as const;

const isImageAsset = (snapshot: HubSnapshot, assetId: string) =>
  snapshot.assets.find((asset) => asset.id === assetId)?.mimeType.startsWith('image/') ?? false;

/** Whether a block has something to show; empty blocks and pages stay out of the hub. */
function hasContent(block: HubBlock, snapshot: HubSnapshot): boolean {
  switch (block.type) {
    case 'text':
      return Boolean(block.content.title || block.content.body);
    case 'strategy':
      return STRATEGY_FIELDS.some((field) => block.content[field].trim() !== '');
    case 'image':
      return Boolean(block.content.assetId && isImageAsset(snapshot, block.content.assetId));
    case 'gallery':
      return block.content.items.some((item) => isImageAsset(snapshot, item.assetId));
    case 'logo':
      return Boolean(block.content.assetId);
    case 'colors':
      return block.content.swatches.length > 0;
    case 'typeface':
      return Boolean(block.content.family);
    case 'downloads':
      return block.content.items.length > 0;
    default:
      return false;
  }
}

const label =
  'font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--hub-text-muted)]';

function Block({
  block,
  snapshot,
  assetUrl,
}: {
  block: HubBlock;
  snapshot: HubSnapshot;
  assetUrl: AssetUrl;
}) {
  const t = useTranslations('brandHub.blocks');
  const assetName = (assetId: string) =>
    snapshot.assets.find((asset) => asset.id === assetId)?.name ?? '';
  if (!hasContent(block, snapshot)) return null;

  switch (block.type) {
    case 'text': {
      const { title, body } = block.content;
      return (
        <section className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-10">
          {title ? (
            <h3 className="text-title-sm font-medium text-[var(--hub-text)]">{title}</h3>
          ) : (
            <span aria-hidden />
          )}
          <div className="flex flex-col gap-3">
            <Paragraphs text={body} />
          </div>
        </section>
      );
    }
    case 'strategy': {
      const filled = STRATEGY_FIELDS.filter((field) => block.content[field].trim() !== '');
      return (
        <dl className="flex flex-col">
          {filled.map((field) => (
            <div
              key={field}
              className="grid gap-2 border-t border-[var(--hub-divider)] py-6 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-10"
            >
              <dt className={label}>{t(`strategy.${field}`)}</dt>
              <dd className="flex flex-col gap-3">
                <Paragraphs
                  text={block.content[field]}
                  className={
                    field === 'mission' || field === 'vision'
                      ? 'text-[22px] leading-snug tracking-[-0.01em]'
                      : undefined
                  }
                />
              </dd>
            </div>
          ))}
        </dl>
      );
    }
    case 'image': {
      const { assetId, caption } = block.content;
      if (!assetId) return null;
      return (
        <figure className="flex flex-col gap-2">
          <Tile>
            <img src={assetUrl(assetId)} alt={caption || assetName(assetId)} className="w-full" />
          </Tile>
          {caption ? (
            <figcaption className="text-body-sm text-[var(--hub-text-muted)]">{caption}</figcaption>
          ) : null}
        </figure>
      );
    }
    case 'gallery': {
      const items = block.content.items.filter((item) => isImageAsset(snapshot, item.assetId));
      return (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {items.map((item) => (
            <li key={item.assetId}>
              <Tile>
                <img
                  src={assetUrl(item.assetId)}
                  alt={item.caption || assetName(item.assetId)}
                  className="aspect-[4/5] w-full object-cover transition-transform duration-500 ease-out hover:scale-[1.02]"
                />
              </Tile>
            </li>
          ))}
        </ul>
      );
    }
    case 'logo': {
      const { assetId, variant, background } = block.content;
      if (!assetId) return null;
      const tiles = snapshot.design.logoTiles;
      return (
        <figure className="flex flex-col gap-3">
          <Tile
            className={cn(
              'flex min-h-56 items-center justify-center p-10',
              tiles ? TILE_BACKGROUND[background] : 'bg-[var(--hub-panel)]',
            )}
          >
            {isImageAsset(snapshot, assetId) ? (
              <img
                src={assetUrl(assetId)}
                alt={variant || assetName(assetId)}
                className="max-h-36 max-w-full object-contain"
              />
            ) : (
              <a href={assetUrl(assetId)} className="text-body-sm underline">
                {variant || assetName(assetId)}
              </a>
            )}
          </Tile>
          {variant ? <figcaption className={label}>{variant}</figcaption> : null}
        </figure>
      );
    }
    case 'colors':
      return (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {block.content.swatches.map((swatch, index) => (
            <li key={`${swatch.hex}-${index}`}>
              <ColorSwatch swatch={swatch} />
            </li>
          ))}
        </ul>
      );
    case 'typeface': {
      const { family, weights, sample } = block.content;
      const fontFamily = `"${cssFamily(family)}"`;
      return (
        <Tile className="grid gap-6 bg-[var(--hub-panel)] p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:p-8">
          <div className="flex flex-col justify-between gap-6">
            <span
              aria-hidden
              className="text-[88px] leading-none font-semibold tracking-[-0.04em] text-[var(--hub-text)]"
              style={{ fontFamily }}
            >
              Aa
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-title-sm text-[var(--hub-text)]">{family}</span>
              {weights.length > 0 ? <span className={label}>{weights.join(' · ')}</span> : null}
            </div>
          </div>
          {sample ? (
            <p
              className="self-end text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.1] tracking-[-0.02em] text-[var(--hub-text)]"
              style={{ fontFamily }}
            >
              {sample}
            </p>
          ) : null}
        </Tile>
      );
    }
    case 'downloads':
      return (
        <ul className="flex flex-col divide-y divide-[var(--hub-divider)] rounded-[var(--hub-radius)] border border-[var(--hub-divider)]">
          {block.content.items.map((item) => (
            <li key={item.assetId}>
              <a
                href={assetUrl(item.assetId)}
                className="flex items-center justify-between px-4 py-3.5 text-body-sm text-[var(--hub-text)] transition-colors duration-150 hover:bg-[var(--hub-panel)]"
              >
                {item.label}
                <span aria-hidden>↓</span>
              </a>
            </li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}

const TEXT_BLOCKS = new Set(['text', 'strategy']);

function Page({
  page,
  snapshot,
  assetUrl,
  split,
  action,
}: {
  page: HubSnapshotPage;
  snapshot: HubSnapshot;
  assetUrl: AssetUrl;
  split: boolean;
  action?: ReactNode;
}) {
  const t = useTranslations('brandHub.view');
  const blocks = page.blocks
    .filter((block) => hasContent(block, snapshot))
    .map((block) => ({
      block,
      node: <Block key={block.id} block={block} snapshot={snapshot} assetUrl={assetUrl} />,
    }));
  const text = blocks.filter(({ block }) => TEXT_BLOCKS.has(block.type));
  const examples = blocks.filter(({ block }) => !TEXT_BLOCKS.has(block.type));

  return (
    <section
      id={page.id}
      aria-labelledby={`${page.id}-title`}
      className="flex scroll-mt-6 flex-col gap-10 border-t border-[var(--hub-divider)] pt-12 first:border-t-0 first:pt-0"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2
          id={`${page.id}-title`}
          className="flex items-baseline gap-5 text-[clamp(2.25rem,5vw,4rem)] leading-[0.95] font-semibold tracking-[-0.035em] text-[var(--hub-text)]"
        >
          <span className="text-[var(--hub-accent)] tabular-nums">{page.number}</span>{' '}
          <span>{page.title}</span>
        </h2>
        {action}
      </div>
      {blocks.length === 0 ? (
        <p className="text-body-sm text-[var(--hub-text-muted)]">{t('empty')}</p>
      ) : split ? (
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-8">{text.map(({ node }) => node)}</div>
          <div className="flex flex-col gap-8">{examples.map(({ node }) => node)}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-10">{blocks.map(({ node }) => node)}</div>
      )}
    </section>
  );
}

/**
 * The brand hub as the client sees it, from a publication or a draft preview: the hub's own colours,
 * corners and layout, its pages numbered in order. Pages without content stay out unless
 * `showEmpty` is set for the team's preview. Pure, so the published site can render it too.
 */
export function HubView({
  snapshot,
  clientName,
  updatedAt,
  assetUrl,
  pageAction,
  footer,
  showEmpty = false,
}: {
  snapshot: HubSnapshot;
  clientName: string;
  updatedAt: string | null;
  assetUrl: AssetUrl;
  pageAction?: (page: HubSnapshotPage) => ReactNode;
  footer?: ReactNode;
  showEmpty?: boolean;
}) {
  const t = useTranslations('brandHub');
  const format = useFormatter();
  const layout = snapshot.design.layout;
  const side = layout === 'sidebar' || layout === 'split';
  const pages = showEmpty
    ? snapshot.pages
    : snapshot.pages.filter((page) => page.blocks.some((block) => hasContent(block, snapshot)));

  const navigation = (
    <nav aria-label={t('view.contents')} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5 border-b border-[var(--hub-divider)] pb-4">
        <p className="text-title-sm font-semibold tracking-[-0.01em] text-[var(--hub-text)]">
          {clientName}
        </p>
        {updatedAt ? (
          <p className="text-caption text-[var(--hub-text-muted)]">
            {t('updatedAt', {
              date: format.dateTime(new Date(updatedAt), {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              }),
            })}
          </p>
        ) : null}
      </div>
      <ul className={cn('flex gap-0.5', side ? 'flex-col' : 'flex-wrap')}>
        {pages.map((page) => (
          <li key={page.id}>
            <a
              href={`#${page.id}`}
              className="flex gap-3 rounded-[var(--hub-radius)] px-2 py-1.5 text-body-sm text-[var(--hub-text)] transition-colors duration-150 hover:bg-[var(--hub-surface)]"
            >
              <span className="text-[var(--hub-text-muted)] tabular-nums">{page.number}</span>{' '}
              {page.title}
            </a>
          </li>
        ))}
      </ul>
      {footer}
    </nav>
  );

  return (
    <div
      data-layout={layout}
      style={hubStyle(snapshot)}
      className={cn(
        'overflow-hidden rounded-lg border border-[var(--hub-divider)] bg-[var(--hub-surface)] text-[var(--hub-text)]',
        side && 'md:grid md:grid-cols-[15rem_minmax(0,1fr)]',
      )}
    >
      <div
        className={cn(
          'bg-[var(--hub-panel)] p-5',
          side ? 'md:sticky md:top-0 md:self-start' : 'border-b border-[var(--hub-divider)]',
        )}
      >
        {navigation}
      </div>
      <div
        className={cn(
          'flex flex-col gap-16 p-6 md:p-12',
          layout === 'compact' && 'mx-auto w-full max-w-3xl',
        )}
      >
        {pages.map((page) => (
          <Page
            key={page.id}
            page={page}
            snapshot={snapshot}
            assetUrl={assetUrl}
            split={layout === 'split'}
            action={pageAction?.(page)}
          />
        ))}
      </div>
    </div>
  );
}
