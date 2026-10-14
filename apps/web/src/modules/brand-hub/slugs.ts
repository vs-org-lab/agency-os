import { eq, like, or } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { slugify } from './domain/slug';

const { brandHubs, clients } = schema;

/** The first free address among `base`, `base-2`, `base-3` and so on. */
export async function uniqueSlug(tx: DbTransaction, base: string): Promise<string> {
  const taken = new Set(
    (
      await tx
        .select({ slug: brandHubs.slug })
        .from(brandHubs)
        .where(or(eq(brandHubs.slug, base), like(brandHubs.slug, `${base}-%`)))
    ).map((row) => row.slug),
  );
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** A free site address from the client's name. */
export async function slugForClient(tx: DbTransaction, clientId: string): Promise<string> {
  const [client] = await tx
    .select({ name: clients.name })
    .from(clients)
    .where(eq(clients.id, clientId));
  return uniqueSlug(tx, slugify(client?.name ?? ''));
}
