import { eq, sql } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import type { Locale } from '@agency-os/i18n';
import { senderName } from './quiet-hours';

const { organizations } = schema;

export type OrganizationSender = { agencyName: string; fromName: string; defaultLocale: Locale };

export async function activeFounders(
  tx: DbTransaction,
  organizationId: string,
): Promise<Array<{ email: string; fullName: string }>> {
  return tx.execute<{ email: string; fullName: string }>(sql`
    select u.email, p.full_name as "fullName"
    from public.organization_memberships m
    join public.profiles p on p.id = m.user_id
    join auth.users u on u.id = m.user_id
    where m.organization_id = ${organizationId}::uuid
      and m.role = 'founder' and m.status = 'active' and m.archived_at is null
      and p.archived_at is null and u.email is not null
    order by m.created_at
  `);
}

/** The display name, sender name and default language an organisation's emails go out with. */
export async function organizationSender(
  tx: DbTransaction,
  organizationId: string,
): Promise<OrganizationSender> {
  const [organization] = await tx
    .select({
      name: organizations.name,
      branding: organizations.portalBranding,
      locale: organizations.defaultLocale,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  if (!organization) throw new Error(`Organization ${organizationId} was not found`);
  const agencyName = organization.branding.displayName ?? organization.name;

  const founders = await activeFounders(tx, organizationId);
  return {
    agencyName,
    fromName: senderName(founders[0]?.fullName ?? '', agencyName),
    defaultLocale: organization.locale,
  };
}
