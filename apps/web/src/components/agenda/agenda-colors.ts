import { clientColor, type AgendaItem } from '@/modules/agenda';

/** One marker colour per client slot (S-04: "cor por cliente"); decorative, beside the text. */
export const CLIENT_COLORS = [
  '#0a7fd1',
  '#1f7a45',
  '#c2620a',
  '#b42f25',
  '#7c3aed',
  '#0e7490',
  '#be185d',
  '#4d7c0f',
] as const;

const STUDIO_COLOR = 'var(--text-secondary)';

export function itemColor(item: Pick<AgendaItem, 'clientId'>): string {
  return item.clientId ? (CLIENT_COLORS[clientColor(item.clientId)] ?? STUDIO_COLOR) : STUDIO_COLOR;
}
