import { foreignKey, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { id, timestamps } from './columns';
import { coreEngagements } from './diagnosis';
import { profiles } from './profiles';

/**
 * The client's answer to an onboarding request of the briefing template. The requests themselves
 * live in the template and are worked out on every read; only what the client did is stored.
 */
export const clientOnboardingResponses = pgTable(
  'client_onboarding_responses',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    engagementId: uuid('engagement_id').notNull(),
    requestId: text('request_id').notNull(),
    response: text('response').notNull().default(''),
    respondedBy: uuid('responded_by').references(() => profiles.id, { onDelete: 'set null' }),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.engagementId, table.clientId],
      foreignColumns: [coreEngagements.id, coreEngagements.clientId],
      name: 'client_onboarding_responses_engagement_client_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'client_onboarding_responses_client_organization_fk',
    }).onDelete('restrict'),
    unique('client_onboarding_responses_request_key').on(table.engagementId, table.requestId),
  ],
).enableRLS();
