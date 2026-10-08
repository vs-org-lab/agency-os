import type { BriefingGuide } from '../templates/definitions';

const HEADING = /^##\s+([a-z0-9_]+)\s*$/;

/**
 * Splits a pasted draft into block notes by its "## <block id>" headings. Headings that are
 * not block ids stay as text of the current block; text without any known heading goes to
 * the first block so nothing pasted is lost.
 */
export function parseBriefingDraft(text: string, guide: BriefingGuide): Record<string, string> {
  const blockIds = new Set(guide.blocks.map((block) => block.id));
  const sections = new Map<string, string[]>();
  let current: string | null = null;

  for (const line of text.split(/\r?\n/)) {
    const heading = HEADING.exec(line.trim());
    if (heading?.[1] && blockIds.has(heading[1])) {
      current = heading[1];
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current) sections.get(current)?.push(line);
  }

  const result: Record<string, string> = {};
  for (const [blockId, lines] of sections) {
    const body = lines.join('\n').trim();
    if (body !== '') result[blockId] = body;
  }
  const firstBlock = guide.blocks[0]?.id;
  if (Object.keys(result).length === 0 && firstBlock && text.trim() !== '') {
    result[firstBlock] = text.trim();
  }
  return result;
}
