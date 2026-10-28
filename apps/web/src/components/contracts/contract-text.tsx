import type { ReactNode } from 'react';
import { cn } from '@agency-os/ui/lib/utils';

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string };

const HEADING = /^(#{1,3}) (.*)$/;

function blocksOf(body: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of body.split('\n')) {
    const line = raw.trimEnd();
    if (line === '') continue;
    const heading = HEADING.exec(line);
    if (heading?.[1] && heading[2] !== undefined) {
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2] });
      continue;
    }
    if (line.startsWith('- ')) {
      const last = blocks.at(-1);
      if (last?.kind === 'list') last.items.push(line.slice(2));
      else blocks.push({ kind: 'list', items: [line.slice(2)] });
      continue;
    }
    blocks.push({ kind: 'paragraph', text: line });
  }
  return blocks;
}

const HEADING_TAG = { 1: 'h2', 2: 'h3', 3: 'h4' } as const;

const HEADING_CLASS = {
  1: 'text-title font-semibold tracking-[-0.02em] text-text',
  2: 'pt-4 text-title-sm font-semibold text-text',
  3: 'pt-2 text-label text-text',
} as const;

/**
 * A contract's text as the reader sees it: the template's `#`, `##` and `###` lines as headings,
 * `- ` lines as lists and every other line as a paragraph. Contract text is plain, never HTML.
 */
export function ContractText({ body, className }: { body: string; className?: string }) {
  return (
    <div className={cn('flex max-w-[72ch] flex-col gap-3 text-body-sm text-text', className)}>
      {blocksOf(body).map((block, index): ReactNode => {
        if (block.kind === 'heading') {
          const Tag = HEADING_TAG[block.level];
          return (
            <Tag key={index} className={HEADING_CLASS[block.level]}>
              {block.text}
            </Tag>
          );
        }
        if (block.kind === 'list') {
          return (
            <ul
              key={index}
              className="flex list-disc flex-col gap-1 pl-5 marker:text-text-tertiary"
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="leading-relaxed">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
