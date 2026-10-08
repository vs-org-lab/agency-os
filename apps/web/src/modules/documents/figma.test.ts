import { describe, expect, it } from 'vitest';
import { toFigmaEmbedUrl } from './figma';

const HOST = 'agency-os';

describe('toFigmaEmbedUrl', () => {
  it('accepts only https figma.com links', () => {
    for (const rejected of [
      'https://figma.com.evil.io/deck/abc/Core',
      'http://www.figma.com/deck/abc/Core',
      'javascript:alert(1)',
      'apresentação no figma',
      'https://www.figma.com/community/file/123',
      'https://evil.io/www.figma.com/deck/abc',
    ]) {
      expect(toFigmaEmbedUrl(rejected, HOST), rejected).toBeNull();
    }
  });

  it('converts a deck link to the embed host', () => {
    expect(toFigmaEmbedUrl('https://www.figma.com/deck/AbC123/Core-Bloom', HOST)).toBe(
      'https://embed.figma.com/deck/AbC123/Core-Bloom?embed-host=agency-os',
    );
  });

  it('keeps the node id in the embed url', () => {
    expect(
      toFigmaEmbedUrl(
        'https://figma.com/proto/AbC123/Core?node-id=1-2&starting-point-node-id=1%3A2&t=xyz',
        HOST,
      ),
    ).toBe(
      'https://embed.figma.com/proto/AbC123/Core?node-id=1-2&starting-point-node-id=1%3A2&embed-host=agency-os',
    );
  });

  it('maps legacy file links to design embeds', () => {
    expect(toFigmaEmbedUrl('https://www.figma.com/file/AbC123/Core?node-id=0-1', HOST)).toBe(
      'https://embed.figma.com/design/AbC123/Core?node-id=0-1&embed-host=agency-os',
    );
  });
});
