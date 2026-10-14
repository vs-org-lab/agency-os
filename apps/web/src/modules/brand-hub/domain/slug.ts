const SLUG = /^[a-z0-9-]{3,60}$/;
const MAX_BASE = 54;
const FALLBACK = 'hub';

/** Whether a slug may be the hub's address on the published site. */
export function isValidSlug(slug: string): boolean {
  return SLUG.test(slug);
}

/**
 * A site address from a client's name: lower case, accents removed, anything else as single
 * hyphens, at most 54 characters so a numeric suffix still fits, and never shorter than three.
 */
export function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_BASE)
    .replace(/-+$/g, '');
  if (base === '') return FALLBACK;
  return base.length < 3 ? `${base}-${FALLBACK}` : base;
}
