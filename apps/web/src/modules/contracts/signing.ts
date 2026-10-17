import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  schema,
  type ContractStatus,
  type DbTransaction,
  type SignatureParty,
} from '@agency-os/db';
import type { Locale } from '@agency-os/i18n';
import { authorize, loadAccessContext, withActor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import { isFounderActor } from '@/modules/commercial';
import { emit, requestFlush } from '@/modules/events';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { sameSigner } from './domain/signature';
import { buildContractPdf, type ContractPdfInput } from './pdf';
import { CONTRACT_URL_TTL_SECONDS, type ContractStorage } from './storage';

const { clients, contractSignatures, contracts, deals, proposals } = schema;

const SIGNING_STAGE = '1.6';

export type SigningDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  storage: ContractStorage;
  /** Moves the deal to 2.1 inside the completing transaction. */
  moveDeal: (tx: DbTransaction, dealId: string) => Promise<void>;
  flush?: () => Promise<void>;
  now?: () => Date;
};

export type SignContractInput = {
  contractId: string;
  party: SignatureParty;
  typedName: string;
  bodyHash: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type SignContractResult =
  | { ok: true; status: 'awaiting_signatures' | 'signed' }
  | { ok: false; rule: 'not_found' | 'name_mismatch' | 'changed' | 'invalid_state' };

export type ContractSignatureView = {
  party: SignatureParty;
  typedName: string;
  signedAt: Date;
};

export type ContractView = {
  id: string;
  status: ContractStatus;
  locale: Locale;
  body: string;
  bodyHash: string;
  signedAt: Date | null;
  pdfAvailable: boolean;
  clientSigner: string;
  studioSigner: string;
  signatures: ContractSignatureView[];
};

const NOT_FOUND = { ok: false, rule: 'not_found' } as const;
const CONTRACT_TIME_ZONE = 'Europe/Lisbon';

const PDF_LABELS: Record<Locale, ContractPdfInput['labels'] & { title: string }> = {
  'pt-PT': {
    title: 'Contrato',
    signatures: 'Assinaturas',
    fingerprint: 'Impressão digital do texto assinado (SHA-256)',
    signedBy: 'Assinado por',
    role: 'Cargo',
    email: 'Email',
    signedAt: 'Data',
    ipAddress: 'Endereço IP',
    page: 'Página {page} de {pages}',
  },
  en: {
    title: 'Agreement',
    signatures: 'Signatures',
    fingerprint: 'Fingerprint of the signed text (SHA-256)',
    signedBy: 'Signed by',
    role: 'Role',
    email: 'Email',
    signedAt: 'Date',
    ipAddress: 'IP address',
    page: 'Page {page} of {pages}',
  },
};

const ipSchema = z.union([z.ipv4(), z.ipv6()]);

function validIp(value: string | null): string | null {
  return value && ipSchema.safeParse(value).success ? value : null;
}

async function clientCanSign(tx: DbTransaction, contractId: string): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    select id from public.portal_contracts where id = ${contractId}::uuid
  `);
  return rows.length > 0;
}

async function founderCanSign(
  deps: SigningDeps,
  claims: VerifiedClaims,
  contractId: string,
): Promise<boolean> {
  return withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (!isFounderActor(actor)) return false;
      const [contract] = await tx
        .select({ clientId: contracts.clientId })
        .from(contracts)
        .where(eq(contracts.id, contractId));
      if (!contract) return false;
      const ctx = await loadAccessContext(tx, actor);
      return authorize(actor, 'write', { type: 'pipeline', clientId: contract.clientId }, ctx)
        .allowed;
    },
    false,
  );
}

function titleOf(body: string, fallback: string): string {
  const heading = body.split('\n').find((line) => line.startsWith('# '));
  return heading ? heading.slice(2).trim() : fallback;
}

async function completeContract(
  tx: DbTransaction,
  contract: {
    id: string;
    organizationId: string;
    clientId: string;
    dealId: string;
    locale: Locale;
    body: string;
    bodyHash: string;
  },
  parties: { client: { legalName: string }; studio: { legalName: string } },
  deps: SigningDeps,
  now: Date,
): Promise<void> {
  const signatures = await tx
    .select()
    .from(contractSignatures)
    .where(eq(contractSignatures.contractId, contract.id))
    .orderBy(asc(contractSignatures.party));
  const labels = PDF_LABELS[contract.locale];
  const dateFormat = new Intl.DateTimeFormat(contract.locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: CONTRACT_TIME_ZONE,
  });
  const pdf = await buildContractPdf({
    title: titleOf(contract.body, labels.title),
    body: contract.body,
    hash: contract.bodyHash,
    labels,
    signatures: signatures.map((signature) => ({
      party: signature.party === 'client' ? parties.client.legalName : parties.studio.legalName,
      name: signature.typedName,
      role: signature.signerRole,
      email: signature.signerEmail,
      signedAt: dateFormat.format(signature.signedAt),
      ipAddress: signature.ipAddress,
    })),
  });
  const path = `${contract.organizationId}/${contract.clientId}/${contract.id}.pdf`;
  await deps.storage.upload(path, pdf);

  await tx
    .update(contracts)
    .set({ status: 'signed', signedAt: now, pdfPath: path })
    .where(eq(contracts.id, contract.id));
  await deps.moveDeal(tx, contract.dealId);
  // A signed contract makes the prospect a client: from here the room, its automations and the
  // reports count it.
  await tx
    .update(clients)
    .set({ lifecycle: 'active' })
    .where(and(eq(clients.id, contract.clientId), ne(clients.lifecycle, 'active')));
  await recordAudit(tx, {
    organizationId: contract.organizationId,
    action: 'contract.completed',
    resourceType: 'contract',
    resourceId: contract.id,
    clientId: contract.clientId,
    metadata: { dealId: contract.dealId },
  });
  await emit(tx, {
    type: 'contracts.contract.signed',
    organizationId: contract.organizationId,
    clientId: contract.clientId,
    payload: { contractId: contract.id, dealId: contract.dealId },
  });
}

/**
 * Records one party's simple electronic signature. The typed name must be the expected signer
 * and the fingerprint must match the stored text; the second signature completes the contract,
 * stores the signed PDF and moves the deal to 2.1.
 */
export async function signContract(
  claims: VerifiedClaims,
  input: SignContractInput,
  deps: SigningDeps,
): Promise<SignContractResult> {
  if (!z.uuid().safeParse(input.contractId).success) return NOT_FOUND;
  const allowed =
    input.party === 'client'
      ? await deps.contexts.withUserContext(claims, (tx) => clientCanSign(tx, input.contractId))
      : await founderCanSign(deps, claims, input.contractId);
  if (!allowed) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();

  const result = await deps.contexts.withSystemContext(
    async (tx): Promise<SignContractResult & { emitted?: boolean }> => {
      const [contract] = await tx
        .select()
        .from(contracts)
        .where(eq(contracts.id, input.contractId))
        .for('update');
      if (!contract || contract.status === 'void') return NOT_FOUND;
      const [proposal] = await tx
        .select({ acceptedBy: proposals.acceptedBy, details: proposals.clientDetails })
        .from(proposals)
        .where(eq(proposals.id, contract.proposalId));
      if (!proposal?.details) return NOT_FOUND;
      if (input.party === 'client' && proposal.acceptedBy !== claims.sub) return NOT_FOUND;
      const studio = contract.studioDetails;

      const [existing] = await tx
        .select({ id: contractSignatures.id })
        .from(contractSignatures)
        .where(
          and(
            eq(contractSignatures.contractId, contract.id),
            eq(contractSignatures.party, input.party),
          ),
        );
      if (existing || contract.status === 'signed') {
        return {
          ok: true,
          status: contract.status === 'signed' ? 'signed' : 'awaiting_signatures',
        };
      }
      const [deal] = await tx
        .select({ code: deals.pipelineCode })
        .from(deals)
        .where(eq(deals.id, contract.dealId));
      if (deal?.code !== SIGNING_STAGE) return { ok: false, rule: 'invalid_state' };
      if (input.bodyHash !== contract.bodyHash) return { ok: false, rule: 'changed' };

      const signer =
        input.party === 'client'
          ? {
              name: proposal.details.signerName,
              role: proposal.details.signerRole,
              email: proposal.details.signerEmail,
            }
          : {
              name: studio.representativeName,
              role: studio.representativeRole,
              email: studio.email,
            };
      if (!sameSigner(input.typedName, signer.name)) return { ok: false, rule: 'name_mismatch' };

      await tx.insert(contractSignatures).values({
        organizationId: contract.organizationId,
        clientId: contract.clientId,
        contractId: contract.id,
        party: input.party,
        signerUserId: claims.sub,
        typedName: input.typedName.trim().replace(/\s+/g, ' '),
        signerRole: signer.role,
        signerEmail: signer.email,
        signedAt: now,
        ipAddress: validIp(input.ipAddress),
        userAgent: input.userAgent?.slice(0, 500) ?? null,
        bodyHash: contract.bodyHash,
      });
      await recordAudit(tx, {
        organizationId: contract.organizationId,
        action: 'contract.signed',
        resourceType: 'contract',
        resourceId: contract.id,
        clientId: contract.clientId,
        metadata: { party: input.party, signerUserId: claims.sub },
      });
      if (input.party === 'client') {
        await emit(tx, {
          type: 'contracts.contract.client_signed',
          organizationId: contract.organizationId,
          clientId: contract.clientId,
          payload: { contractId: contract.id, dealId: contract.dealId },
        });
      }

      const signatures = await tx
        .select({ party: contractSignatures.party })
        .from(contractSignatures)
        .where(eq(contractSignatures.contractId, contract.id));
      if (new Set(signatures.map((row) => row.party)).size < 2) {
        return { ok: true, status: 'awaiting_signatures', emitted: true };
      }
      await completeContract(
        tx,
        contract,
        {
          client: { legalName: proposal.details.legalName },
          studio: { legalName: studio.legalName },
        },
        deps,
        now,
      );
      return { ok: true, status: 'signed', emitted: true };
    },
  );

  if (!result.ok) return result;
  if (result.emitted) await (deps.flush ?? requestFlush)();
  return { ok: true, status: result.status };
}

export async function voidContract(
  claims: VerifiedClaims,
  input: { contractId: string; reason: string },
  deps: Pick<SigningDeps, 'contexts'>,
): Promise<{ ok: true } | { ok: false; rule: 'not_found' | 'invalid_input' | 'invalid_state' }> {
  if (!z.uuid().safeParse(input.contractId).success) return NOT_FOUND;
  const reason = input.reason.trim();
  if (reason.length === 0 || reason.length > 500) return { ok: false, rule: 'invalid_input' };
  const allowed = await founderCanSign(deps as SigningDeps, claims, input.contractId);
  if (!allowed) return NOT_FOUND;

  return deps.contexts.withSystemContext(async (tx) => {
    const [contract] = await tx
      .select()
      .from(contracts)
      .where(eq(contracts.id, input.contractId))
      .for('update');
    if (!contract) return NOT_FOUND;
    if (contract.status !== 'awaiting_signatures') {
      return { ok: false as const, rule: 'invalid_state' as const };
    }
    await tx
      .update(contracts)
      .set({ status: 'void', voidedAt: new Date(), voidReason: reason })
      .where(eq(contracts.id, contract.id));
    await tx
      .update(proposals)
      .set({
        status: 'sent',
        acceptedAt: null,
        acceptedBy: null,
        acceptedOptionId: null,
        clientDetails: null,
      })
      .where(eq(proposals.id, contract.proposalId));
    await recordAudit(tx, {
      organizationId: contract.organizationId,
      action: 'contract.voided',
      resourceType: 'contract',
      resourceId: contract.id,
      clientId: contract.clientId,
      metadata: { reason },
    });
    return { ok: true as const };
  });
}

export async function getDealContract(
  tx: DbTransaction,
  dealId: string,
): Promise<ContractView | null> {
  const [contract] = await tx
    .select({
      id: contracts.id,
      status: contracts.status,
      locale: contracts.locale,
      body: contracts.body,
      bodyHash: contracts.bodyHash,
      signedAt: contracts.signedAt,
      pdfPath: contracts.pdfPath,
      proposalId: contracts.proposalId,
      studioDetails: contracts.studioDetails,
    })
    .from(contracts)
    .where(and(eq(contracts.dealId, dealId), ne(contracts.status, 'void')))
    .orderBy(desc(contracts.createdAt))
    .limit(1);
  if (!contract) return null;
  const [proposal] = await tx
    .select({ details: proposals.clientDetails })
    .from(proposals)
    .where(eq(proposals.id, contract.proposalId));
  const signatures = await tx
    .select({
      party: contractSignatures.party,
      typedName: contractSignatures.typedName,
      signedAt: contractSignatures.signedAt,
    })
    .from(contractSignatures)
    .where(eq(contractSignatures.contractId, contract.id))
    .orderBy(asc(contractSignatures.signedAt));

  return {
    id: contract.id,
    status: contract.status,
    locale: contract.locale,
    body: contract.body,
    bodyHash: contract.bodyHash,
    signedAt: contract.signedAt,
    pdfAvailable: contract.pdfPath !== null,
    clientSigner: proposal?.details?.signerName ?? '',
    studioSigner: contract.studioDetails.representativeName,
    signatures,
  };
}

/** A short-lived link to the signed PDF, for staff with pipeline access or the client's signer role. */
export async function contractPdfUrl(
  claims: VerifiedClaims,
  input: { contractId: string },
  deps: Pick<SigningDeps, 'contexts' | 'storage'>,
): Promise<string | null> {
  if (!z.uuid().safeParse(input.contractId).success) return null;
  const visible = await deps.contexts.withUserContext(claims, async (tx) => {
    const [staff] = await tx
      .select({ id: contracts.id })
      .from(contracts)
      .where(eq(contracts.id, input.contractId));
    return staff !== undefined || (await clientCanSign(tx, input.contractId));
  });
  if (!visible) return null;
  const [contract] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ pdfPath: contracts.pdfPath, status: contracts.status })
      .from(contracts)
      .where(eq(contracts.id, input.contractId)),
  );
  if (!contract?.pdfPath || contract.status !== 'signed') return null;
  return deps.storage.signedUrl(contract.pdfPath, CONTRACT_URL_TTL_SECONDS);
}

export type PortalContractView = {
  id: string;
  status: ContractStatus;
  body: string;
  bodyHash: string;
  signedAt: Date | null;
  clientSignedAt: Date | null;
  studioSignedAt: Date | null;
  /** The name the signed-in decision maker must type; null when someone else accepted. */
  expectedSigner: string | null;
};

export async function getPortalContract(
  claims: VerifiedClaims,
  input: { contractId: string },
  deps: Pick<SigningDeps, 'contexts'>,
): Promise<PortalContractView | null> {
  if (!z.uuid().safeParse(input.contractId).success) return null;
  const rows = await deps.contexts.withUserContext(claims, (tx) =>
    tx.execute<{
      id: string;
      proposal_id: string;
      status: ContractStatus;
      body: string;
      body_hash: string;
      signed_at: string | Date | null;
      client_signed_at: string | Date | null;
      studio_signed_at: string | Date | null;
    }>(sql`
      select id, proposal_id, status::text as status, body, body_hash, signed_at,
             client_signed_at, studio_signed_at
      from public.portal_contracts
      where id = ${input.contractId}::uuid
    `),
  );
  const contract = rows[0];
  if (!contract) return null;
  const [proposal] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ acceptedBy: proposals.acceptedBy, details: proposals.clientDetails })
      .from(proposals)
      .where(eq(proposals.id, contract.proposal_id)),
  );
  const date = (value: string | Date | null) => (value ? new Date(value) : null);
  return {
    id: contract.id,
    status: contract.status,
    body: contract.body,
    bodyHash: contract.body_hash,
    signedAt: date(contract.signed_at),
    clientSignedAt: date(contract.client_signed_at),
    studioSignedAt: date(contract.studio_signed_at),
    expectedSigner:
      proposal?.acceptedBy === claims.sub ? (proposal.details?.signerName ?? null) : null,
  };
}
