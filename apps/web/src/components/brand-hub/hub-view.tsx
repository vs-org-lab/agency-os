import type { CSSProperties, ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { cn } from '@agency-os/ui/lib/utils';
import type { HubBlock, HubSnapshot, HubSnapshotPage } from '@/modules/brand-hub';

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

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line text-body text-[var(--hub-text)]">
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
  const isImage = (assetId: string) =>
    snapshot.assets.find((asset) => asset.id === assetId)?.mimeType.startsWith('image/') ?? false;

  switch (block.type) {
    case 'text': {
      const { title, body } = block.content;
      if (!title && !body) return null;
      return (
        <section className="flex flex-col gap-3">
          {title ? <h3 className="text-title-sm text-[var(--hub-text)]">{title}</h3> : null}
          <Paragraphs text={body} />
        </section>
      );
    }
    case 'strategy': {
      const filled = STRATEGY_FIELDS.filter((field) => block.content[field].trim() !== '');
      if (filled.length === 0) return null;
      return (
        <dl className="flex flex-col gap-5">
          {filled.map((field) => (
            <div key={field} className="flex flex-col gap-1">
              <dt className="text-caption uppercase tracking-wide text-[var(--hub-text-muted)]">
                {t(`strategy.${field}`)}
              </dt>
              <dd className="flex flex-col gap-2">
                <Paragraphs text={block.content[field]} />
              </dd>
            </div>
          ))}
        </dl>
      );
    }
    case 'image': {
      const { assetId, caption } = block.content;
      if (!assetId || !isImage(assetId)) return null;
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
      const items = block.content.items.filter((item) => isImage(item.assetId));
      if (items.length === 0) return null;
      return (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {items.map((item) => (
            <li key={item.assetId}>
              <Tile>
                <img
                  src={assetUrl(item.assetId)}
                  alt={item.caption || assetName(item.assetId)}
                  className="aspect-square w-full object-cover"
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
        <figure className="flex flex-col gap-2">
          <Tile
            className={cn(
              'flex min-h-40 items-center justify-center p-8',
              tiles ? TILE_BACKGROUND[background] : 'bg-[var(--hub-panel)]',
            )}
          >
            {isImage(assetId) ? (
              <img
                src={assetUrl(assetId)}
                alt={variant || assetName(assetId)}
                className="max-h-32 max-w-full object-contain"
              />
            ) : (
              <a href={assetUrl(assetId)} className="text-body-sm underline">
                {variant || assetName(assetId)}
              </a>
            )}
          </Tile>
          {variant ? (
            <figcaption className="text-body-sm text-[var(--hub-text-muted)]">{variant}</figcaption>
          ) : null}
        </figure>
      );
    }
    case 'colors': {
      if (block.content.swatches.length === 0) return null;
      return (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {block.content.swatches.map((swatch, index) => (
            <li key={`${swatch.hex}-${index}`}>
              <Tile>
                <div className="h-24" style={{ backgroundColor: swatch.hex }} aria-hidden="true" />
                <div className="flex flex-col gap-0.5 bg-[var(--hub-panel)] p-3">
                  <span className="text-body-sm font-medium text-[var(--hub-text)]">
                    {swatch.name}
                  </span>
                  <span className="font-mono text-caption text-[var(--hub-text-muted)]">
                    {swatch.hex.toUpperCase()}
                  </span>
                  {swatch.notes ? (
                    <span className="text-caption text-[var(--hub-text-muted)]">
                      {swatch.notes}
                    </span>
                  ) : null}
                </div>
              </Tile>
            </li>
          ))}
        </ul>
      );
    }
    case 'typeface': {
      const { family, weights, sample } = block.content;
      if (!family) return null;
      return (
        <Tile className="flex flex-col gap-2 bg-[var(--hub-panel)] p-5">
          <span className="text-title-sm text-[var(--hub-text)]">{family}</span>
          {weights.length > 0 ? (
            <span className="text-caption text-[var(--hub-text-muted)]">{weights.join(' · ')}</span>
          ) : null}
          {sample ? (
            <p
              className="text-title text-[var(--hub-text)]"
              style={{ fontFamily: `"${cssFamily(family)}"` }}
            >
              {sample}
            </p>
          ) : null}
        </Tile>
      );
    }
    case 'downloads': {
      if (block.content.items.length === 0) return null;
      return (
        <ul className="flex flex-col divide-y divide-[var(--hub-divider)] rounded-[var(--hub-radius)] border border-[var(--hub-divider)]">
          {block.content.items.map((item) => (
            <li key={item.assetId}>
              <a
                href={assetUrl(item.assetId)}
                className="flex px-4 py-3 text-body-sm text-[var(--hub-text)] underline-offset-2 hover:underline"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      );
    }
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
  const blocks = page.blocks.map((block) => ({
    block,
    node: <Block key={block.id} block={block} snapshot={snapshot} assetUrl={assetUrl} />,
  }));
  const text = blocks.filter(({ block }) => TEXT_BLOCKS.has(block.type));
  const examples = blocks.filter(({ block }) => !TEXT_BLOCKS.has(block.type));

  return (
    <section
      id={page.id}
      aria-labelledby={`${page.id}-title`}
      className="flex scroll-mt-6 flex-col gap-6 border-t border-[var(--hub-divider)] pt-8 first:border-t-0 first:pt-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${page.id}-title`} className="text-title text-[var(--hub-text)]">
          <span className="text-[var(--hub-accent)]">{page.number}</span> {page.title}
        </h2>
        {action}
      </div>
      {page.blocks.length === 0 ? (
        <p className="text-body-sm text-[var(--hub-text-muted)]">{t('empty')}</p>
      ) : split ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-6">{text.map(({ node }) => node)}</div>
          <div className="flex flex-col gap-6">{examples.map(({ node }) => node)}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">{blocks.map(({ node }) => node)}</div>
      )}
    </section>
  );
}

/**
 * The brand hub as the client sees it, from a publication or a draft preview: the hub's own colours,
 * corners and layout, its pages numbered in order. Pure, so the published site can render it too.
 */
export function HubView({
  snapshot,
  clientName,
  updatedAt,
  assetUrl,
  pageAction,
  footer,
}: {
  snapshot: HubSnapshot;
  clientName: string;
  updatedAt: string | null;
  assetUrl: AssetUrl;
  pageAction?: (page: HubSnapshotPage) => ReactNode;
  footer?: ReactNode;
}) {
  const t = useTranslations('brandHub');
  const format = useFormatter();
  const layout = snapshot.design.layout;
  const side = layout === 'sidebar' || layout === 'split';

  const navigation = (
    <nav aria-label={t('view.contents')} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-title-sm text-[var(--hub-text)]">{clientName}</p>
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
      <ul className={cn('flex gap-1', side ? 'flex-col' : 'flex-wrap')}>
        {snapshot.pages.map((page) => (
          <li key={page.id}>
            <a
              href={`#${page.id}`}
              className="flex rounded-[var(--hub-radius)] px-3 py-1.5 text-body-sm text-[var(--hub-text)] hover:bg-[var(--hub-surface)]"
            >
              {page.number} {page.title}
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
        side && 'md:grid md:grid-cols-[16rem_minmax(0,1fr)]',
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
          'flex flex-col gap-10 p-5 md:p-8',
          layout === 'compact' && 'mx-auto w-full max-w-3xl',
        )}
      >
        {snapshot.pages.map((page) => (
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
