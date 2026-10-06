import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const BACKGROUND = '#0A0F15';
const FOREGROUND = '#ECEFF3';
const SYMBOL_VIEWBOX = { width: 271.7, height: 244.2 };

const root = path.resolve(import.meta.dirname, '../../..');
const output = path.resolve(import.meta.dirname, '../public/icons');
const symbol = readFileSync(path.join(root, 'assets/brand/symbol.svg'), 'utf8');
const paths = [...symbol.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((match) => match[1]);

function iconSvg(size: number, padding: number, rounded: boolean): string {
  const available = size * (1 - padding * 2);
  const scale = Math.min(available / SYMBOL_VIEWBOX.width, available / SYMBOL_VIEWBOX.height);
  const offsetX = (size - SYMBOL_VIEWBOX.width * scale) / 2;
  const offsetY = (size - SYMBOL_VIEWBOX.height * scale) / 2;
  const radius = rounded ? size * 0.22 : 0;
  const shapes = paths.map((d) => `<path d="${d}"/>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BACKGROUND}"/>
  <g fill="${FOREGROUND}" transform="translate(${offsetX} ${offsetY}) scale(${scale})">${shapes}</g>
</svg>`;
}

const icons = [
  { file: 'icon-192.png', size: 192, padding: 0.18, rounded: true },
  { file: 'icon-512.png', size: 512, padding: 0.18, rounded: true },
  { file: 'maskable-512.png', size: 512, padding: 0.28, rounded: false },
  { file: 'apple-touch-icon.png', size: 180, padding: 0.18, rounded: false },
];

mkdirSync(output, { recursive: true });
for (const icon of icons) {
  const png = new Resvg(iconSvg(icon.size, icon.padding, icon.rounded)).render().asPng();
  writeFileSync(path.join(output, icon.file), png);
}
writeFileSync(path.join(output, 'icon.svg'), iconSvg(64, 0.14, true));
console.log(`Generated ${icons.length + 1} icons in ${path.relative(root, output)}`);
