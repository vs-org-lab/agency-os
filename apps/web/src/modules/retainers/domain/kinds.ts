export const RETAINER_LIMIT_KINDS = [
  'content_pieces',
  'campaigns',
  'maintenance_hours',
  'automations',
] as const;

export type RetainerLimitKind = (typeof RETAINER_LIMIT_KINDS)[number];
