import { describe, expect, it } from 'vitest';
import { describeUserAgent } from './user-agent';

describe('describeUserAgent', () => {
  it('summarises common browsers and systems', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome · Windows');
    expect(
      describeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari · iOS');
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      ),
    ).toBe('Edge · macOS');
    expect(
      describeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'),
    ).toBe('Firefox · Linux');
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome · Android');
  });

  it('returns null for missing or unrecognised agents', () => {
    expect(describeUserAgent(null)).toBeNull();
    expect(describeUserAgent('node')).toBeNull();
  });
});
