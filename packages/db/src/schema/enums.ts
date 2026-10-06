import { pgSchema } from 'drizzle-orm/pg-core';

export const appSchema = pgSchema('app');

export const localeEnum = appSchema.enum('locale', ['pt-PT', 'en']);

export const currencyEnum = appSchema.enum('currency', ['EUR', 'GBP', 'USD']);

export const profileKindEnum = appSchema.enum('profile_kind', ['internal', 'client']);

export const orgRoleEnum = appSchema.enum('org_role', [
  'founder',
  'project_manager',
  'freelancer',
  'finance',
]);

export const clientRoleEnum = appSchema.enum('client_role', [
  'decision_maker',
  'operational',
  'client_finance',
]);

export const membershipStatusEnum = appSchema.enum('membership_status', [
  'invited',
  'active',
  'revoked',
]);

export const actorKindEnum = appSchema.enum('actor_kind', ['user', 'agent', 'system']);

export const eventStatusEnum = appSchema.enum('event_status', ['pending', 'dispatched', 'failed']);
