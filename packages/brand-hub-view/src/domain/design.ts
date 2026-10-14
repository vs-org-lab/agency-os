import { z } from 'zod';

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const HUB_LAYOUTS = ['sidebar', 'topbar', 'split', 'compact'] as const;

export const hubDesignSchema = z.strictObject({
  colors: z.strictObject({
    surface: hex,
    panel: hex,
    text: hex,
    textMuted: hex,
    accent: hex,
    divider: hex,
  }),
  corners: z.enum(['soft', 'square']),
  logoTiles: z.boolean(),
  layout: z.enum(HUB_LAYOUTS),
});

export type HubDesign = z.infer<typeof hubDesignSchema>;
export type HubLayout = HubDesign['layout'];
export type HubColorName = keyof HubDesign['colors'];

export const DEFAULT_HUB_DESIGN: HubDesign = {
  colors: {
    surface: '#FFFFFF',
    panel: '#F5F5F4',
    text: '#1C1917',
    textMuted: '#57534E',
    accent: '#1C1917',
    divider: '#E7E5E4',
  },
  corners: 'soft',
  logoTiles: true,
  layout: 'sidebar',
};
