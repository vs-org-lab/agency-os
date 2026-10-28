/** The RGB channels of a #RRGGBB colour, as "R G B". */
export function rgbOf(hex: string): string {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16)).join(' ');
}

/** An approximate CMYK of a #RRGGBB colour, in whole percentages, as "C M Y K". */
export function cmykOf(hex: string): string {
  const [r, g, b] = rgbOf(hex)
    .split(' ')
    .map((channel) => Number(channel) / 255) as [number, number, number];
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return '0 0 0 100';
  const part = (channel: number) => Math.round(((1 - channel - k) / (1 - k)) * 100);
  return [part(r), part(g), part(b), Math.round(k * 100)].join(' ');
}
