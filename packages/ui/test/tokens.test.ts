import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const tokensPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/styles/tokens.css',
);

function readBlock(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Selector ${selector} not found`);
  const end = css.indexOf('}', start);
  const body = css.slice(start, end);
  const declarations = new Map<string, string>();
  for (const match of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value)
      declarations.set(
        name,
        value.trim().replace(/^#[0-9a-f]{6}$/i, (hex) => hex.toUpperCase()),
      );
  }
  return declarations;
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

const css = readFileSync(tokensPath, 'utf8');
const themes = {
  light: readBlock(css, ':root'),
  dark: readBlock(css, '.dark'),
};

const colorTokens = [
  'canvas',
  'surface',
  'surface-muted',
  'border',
  'border-strong',
  'text',
  'text-secondary',
  'text-tertiary',
  'primary',
  'primary-foreground',
  'accent',
  'link',
  'gold',
];
const stateTokens = ['neutral', 'info', 'success', 'warning', 'danger'];

describe('design tokens', () => {
  it('defines every token from design system 05 in light and dark', () => {
    const expected = [...colorTokens, ...stateTokens, ...stateTokens.map((state) => `${state}-bg`)];
    for (const theme of Object.values(themes)) {
      for (const token of expected) {
        expect(theme.get(token), token).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });

  it('light canvas is #FBFBFB and dark canvas is #0A0F15', () => {
    expect(themes.light.get('canvas')).toBe('#FBFBFB');
    expect(themes.dark.get('canvas')).toBe('#0A0F15');
  });

  it('accent is #0A7FD1 light and #4FA8EC dark', () => {
    expect(themes.light.get('accent')).toBe('#0A7FD1');
    expect(themes.dark.get('accent')).toBe('#4FA8EC');
  });

  it('text contrast is at least 4.5:1 against surface in both themes', () => {
    for (const [name, theme] of Object.entries(themes)) {
      const surface = theme.get('surface') as string;
      for (const token of ['text', 'text-secondary', 'text-tertiary', 'link', ...stateTokens]) {
        const ratio = contrastRatio(theme.get(token) as string, surface);
        expect(ratio, `${name} ${token}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const state of stateTokens) {
        const ratio = contrastRatio(theme.get(state) as string, theme.get(`${state}-bg`) as string);
        expect(ratio, `${name} ${state} on ${state}-bg`).toBeGreaterThanOrEqual(4.5);
      }
      const primary = contrastRatio(
        theme.get('primary-foreground') as string,
        theme.get('primary') as string,
      );
      expect(primary, `${name} primary`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('durations fast, base and slow are 120ms, 180ms and 240ms', () => {
    expect(themes.light.get('duration-fast')).toBe('120ms');
    expect(themes.light.get('duration-base')).toBe('180ms');
    expect(themes.light.get('duration-slow')).toBe('240ms');
  });

  it('radii are 6, 8, 12 and 16 px', () => {
    expect(themes.light.get('radius-field')).toBe('6px');
    expect(themes.light.get('radius-button')).toBe('8px');
    expect(themes.light.get('radius-card')).toBe('12px');
    expect(themes.light.get('radius-dialog')).toBe('16px');
  });

  it('reduced motion sets every duration to 0ms', () => {
    const reduced = css.slice(css.indexOf('prefers-reduced-motion'));
    for (const duration of ['fast', 'base', 'slow', 'moment']) {
      expect(reduced).toMatch(new RegExp(`--duration-${duration}:\\s*0ms`));
    }
  });
});
