import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { createContractFixture, testDatabase, type World } from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import type { BillingDeps } from './requests';
import { createMemoryBillingStorage } from './storage';

export const BILLING_TEST_NOW = new Date('2026-10-09T10:00:00Z');

export function billingClaims(
  userId: string,
  userKind: 'internal' | 'client' = 'internal',
): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
    user_kind: userKind,
  };
}

export function billingDeps(sql: TransactionSql, overrides: Partial<BillingDeps> = {}) {
  const storage = createMemoryBillingStorage();
  const moved: string[] = [];
  const deps: BillingDeps = {
    contexts: createDbContexts(testDatabase(sql)),
    storage,
    appBaseUrl: 'https://app.aurion.test',
    moveDeal: async (_tx, dealId) => {
      moved.push(dealId);
    },
    flush: async () => {},
    now: () => BILLING_TEST_NOW,
    ...overrides,
  };
  return { deps, storage, moved };
}

export type SignedContract = { contractId: string; dealId: string; clientId: string };

/**
 * Client A's fixture contract, signed, with the accepted 50/50 option of 12 000 EUR and the deal
 * at 2.1. Client B's contract is left awaiting signatures.
 */
export async function signedContract(sql: TransactionSql, world: World): Promise<SignedContract> {
  const fixture = await createContractFixture(sql, world);
  const records = fixture.a;
  await sql`
    update public.legal_entities
    set bank_name = 'Banco Exemplo', iban = 'PT50000201231234567890154', bic = 'BEXAPTPL'
    where id = ${fixture.entityId}
  `;
  await sql`
    update public.proposals
    set status = 'accepted', accepted_at = now(), accepted_by = ${world.users.decisionMakerA},
        accepted_option_id = ${records.optionId},
        client_details = ${JSON.stringify({
          legalName: 'Empresa Cliente SA',
          taxId: '500100200',
          address: 'Porto',
          signerName: 'Ana Costa',
          signerRole: 'Administradora',
          signerEmail: 'ana@cliente.test',
        })}::jsonb
    where id = ${records.proposalId}
  `;
  await sql`
    update public.contracts set status = 'signed', signed_at = now() where id = ${records.contractId}
  `;
  await sql`update public.deals set pipeline_code = '2.1' where id = ${records.dealId}`;
  return { contractId: records.contractId, dealId: records.dealId, clientId: world.clients.a };
}

/** The deal's project, delivered, so its delivery milestone is no longer locked (RN-32). */
export async function deliveredProject(
  sql: TransactionSql,
  world: World,
  contract: SignedContract,
): Promise<void> {
  await sql`
    insert into public.projects (organization_id, client_id, deal_id, name, template_key,
                                 template_version, starts_on, status)
    values (${world.organizationId}, ${contract.clientId}, ${contract.dealId}, 'Website', 'orbit', 1,
            current_date, 'delivered')
  `;
}
